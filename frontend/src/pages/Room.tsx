import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { io } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import FileTree from '../components/FileTree';
import CreateFileModal from '../components/CreateFileModal';
import CopilotModal from '../components/CopilotModal';
// Fabric has a slightly tricky TS surface; this import style works reliably with CRA + TS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fabric = require('fabric');
const { Canvas, util, PencilBrush, Path, classRegistry } = fabric;

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5008';

const Room = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentUserId = user?.id || user?._id;

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { position: { lineNumber: number; column: number }; username?: string }>>({});
  const [runOutput, setRunOutput] = useState('');
  const [runError, setRunError] = useState('');
  const [runTime, setRunTime] = useState(null);
  const [runLoading, setRunLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editorTheme, setEditorTheme] = useState('vs-dark');
  const [showCopilotMenu, setShowCopilotMenu] = useState(false);
  const [showCopilotModal, setShowCopilotModal] = useState(false);
  const [copilotAction, setCopilotAction] = useState<'Generate' | 'Insert' | 'Replace' | 'Suggest'>('Generate');
  const [participants, setParticipants] = useState([]);
  const [onlineMap, setOnlineMap] = useState({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editParent, setEditParent] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [activeUsersByFile, setActiveUsersByFile] = useState<Record<string, Array<{ username?: string; userId?: string }>>>({});
  const [contributorsByFile, setContributorsByFile] = useState({});
  const [activity, setActivity] = useState([]);
  const whiteboardContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const focusedFileIdRef = useRef(null);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const isRemoteUpdate = useRef(false);
  const isSendingMessageRef = useRef(false);
  const pendingMessageIdsRef = useRef(new Set());
  const lastSendSignatureRef = useRef({ sig: null, at: 0 });
  const canvasRef = useRef(null);
  const fabricRef = useRef(null);
  const seenMessagesRef = useRef(new Set());
  const seenActivitiesRef = useRef(new Set());
  const cursorColorsRef = useRef({});
  const cursorPalette = ['#00c853', '#2962ff', '#ff6d00', '#d81b60', '#8e24aa', '#00897b', '#fdd835', '#5e35b1'];
  const currentFileIdRef = useRef(null);
  const repositoryIdRef = useRef(null);
  const historyStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const [brushColor, setBrushColor] = useState('#00c853');
  const [brushSize, setBrushSize] = useState(3);
  const brushColorRef = useRef('#00c853');
  const brushSizeRef = useRef(3);
  const lastUndoneStrokeIdRef = useRef(null);
  const lastRedoneStrokeIdRef = useRef(null);
  const [canRedo, setCanRedo] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const computeCanvasSize = () => {
    // Fixed canvas size as requested
    return { width: 936, height: 500 };
  };

  const getUserRole = () => {
    if (!room || !user || !currentUserId) return 'viewer';
    const hostId = room.host?._id || room.host;
    if (hostId && String(hostId) === String(currentUserId)) return 'admin';
    const participant = room.participants?.find((p) => {
      const uid = p.user?._id || p.user;
      return uid && String(uid) === String(currentUserId);
    });
    return participant?.role || 'viewer';
  };
  const userRole = getUserRole();
  const isViewer = userRole === 'viewer';
  const canManageParticipants = userRole === 'admin';

  const getCursorColor = (uid) => {
    if (!cursorColorsRef.current[uid]) {
      const index = Object.keys(cursorColorsRef.current).length % cursorPalette.length;
      cursorColorsRef.current[uid] = cursorPalette[index];
    }
    return cursorColorsRef.current[uid];
  };

  useEffect(() => {
    initializeRoom();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (fabricRef.current) {
        fabricRef.current.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const initializeRoom = async () => {
    try {
      const response = await axios.post(`/rooms/${roomId}/join`);
      setRoom(response.data.room);
      setParticipants(response.data.room?.participants || []);
      // Initialize online map (all present participants online)
      const initialOnline = {};
      (response.data.room?.participants || []).forEach((p) => {
        const uid = p.user?._id || p.user;
        if (uid) initialOnline[uid] = true;
      });
      if (response.data.room?.host) {
        const hostId = response.data.room.host?._id || response.data.room.host;
        if (hostId) initialOnline[hostId] = true;
      }
      setOnlineMap(initialOnline);
      if (response.data.room?.repository?._id) {
        repositoryIdRef.current = response.data.room.repository._id;
        await fetchFiles(repositoryIdRef.current);
        currentFileIdRef.current = null;
        setCurrentFile(null);
        setCode('');
      }

      // Disconnect existing socket if any
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      }
      
      const socket = io(SOCKET_URL);
      socketRef.current = socket;

      socket.emit('join-room', {
        roomId,
        userId: currentUserId,
        username: user.username
      });

      socket.on('receive-message', (message) => {
        // Only skip our own messages - we've already added them optimistically
        const messageUserId = message.userId || message.user?._id || message.user;
        const localUserId = currentUserId;
        
        console.log('Received message event:', {
          messageUserId,
          currentUserId: localUserId,
          messageUserIdType: typeof messageUserId,
          currentUserIdType: typeof localUserId,
          areEqual: String(messageUserId) === String(localUserId),
          messagePreview: message.message?.substring(0, 50)
        });
        
        if (messageUserId && localUserId && String(messageUserId) === String(localUserId)) {
          console.log('Received own message from socket, skipping to prevent duplicate', {
            messageUserId,
            currentUserId: localUserId
          });
          return;
        }
        
        console.log('Received message raw:', message);
        console.log('Received message parsed:', { 
          username: message.username, 
          hasImage: !!message.image, 
          imageType: typeof message.image,
          imageValue: message.image ? message.image.substring(0, 50) + '...' : message.image,
          messageType: message.messageType,
          imageLength: message.image?.length,
          messageText: message.message,
          userId: message.userId,
          timestamp: message.timestamp,
          isOwnMessage: message.userId === currentUserId
        });
        
        // Use timestamp from server if available, otherwise create one
        const timestamp = message.timestamp || new Date().toISOString();
        
        const normalized = {
          username: message.username,
          userId: message.userId,
          content: message.message || '',
          image: (message.image !== undefined && message.image !== null && message.image !== '') ? message.image : null,
          imageName: message.imageName || null,
          messageType: message.messageType || (message.image ? 'image' : 'text'),
          timestamp: timestamp
        };
        
        console.log('Normalized message:', {
          hasImage: !!normalized.image,
          imageLength: normalized.image?.length,
          messageType: normalized.messageType,
          imagePreview: normalized.image ? normalized.image.substring(0, 50) : null,
          timestamp: normalized.timestamp,
          isOwnMessage: normalized.userId === currentUserId
        });
        
        // Create a stable deduplication key using username, userId, content/image hash, and timestamp
        // For images, create a hash from the first 50 and last 50 chars of base64
        let contentHash;
        if (normalized.image) {
          const start = normalized.image.substring(0, 50);
          const end = normalized.image.substring(Math.max(0, normalized.image.length - 50));
          contentHash = `img-${start}-${end}`.substring(0, 100); // Limit hash length
        } else {
          contentHash = normalized.content.substring(0, 100);
        }
        
        // Use userId + timestamp + content hash for deduplication
        // For sender's own messages, also check if we just sent it optimistically
        const key = `${normalized.userId || normalized.username}-${timestamp}-${contentHash}`;
        const optimisticKey = `${normalized.userId || normalized.username}-optimistic-${contentHash}`;
        
        // Check both the server key and optimistic key
        if (seenMessagesRef.current.has(key) || seenMessagesRef.current.has(optimisticKey)) {
          console.log('Message already seen, skipping duplicate:', {
            username: normalized.username,
            timestamp: normalized.timestamp.substring(0, 20),
            hasImage: !!normalized.image,
            isOwnMessage: normalized.userId === currentUserId,
            hadOptimistic: seenMessagesRef.current.has(optimisticKey)
          });
          
          // If it was an optimistic message from sender, replace it with server version
          if (normalized.userId === currentUserId && seenMessagesRef.current.has(optimisticKey)) {
            console.log('Replacing optimistic message with server version');
            setMessages((prev) => prev.map(msg => {
              // Find the optimistic message and replace with server version
              const msgContentHash = msg.image ? 
                `img-${msg.image.substring(0, 50)}-${msg.image.substring(Math.max(0, msg.image.length - 50))}`.substring(0, 100) :
                (msg.content || '').substring(0, 100);
              const msgOptimisticKey = `${msg.userId || msg.username}-optimistic-${msgContentHash}`;
              
              if (msgOptimisticKey === optimisticKey) {
                return normalized; // Replace with server version
              }
              return msg;
            }));
            seenMessagesRef.current.delete(optimisticKey);
            seenMessagesRef.current.add(key);
          }
          return;
        }
        
        // Add to seen messages before adding to state to prevent race conditions
        seenMessagesRef.current.add(key);
        
        // Clean up old keys to prevent memory issues (keep last 200)
        if (seenMessagesRef.current.size > 200) {
          const keysArray = Array.from(seenMessagesRef.current);
          keysArray.slice(0, seenMessagesRef.current.size - 200).forEach(k => seenMessagesRef.current.delete(k));
        }
        
        console.log('Adding message to state:', { 
          username: normalized.username,
          hasImage: !!normalized.image,
          imageLength: normalized.image?.length,
          isOwnMessage: normalized.userId === currentUserId,
          key: key.substring(0, 80)
        });
        setMessages((prev) => [...prev, normalized]);
      });

      socket.on('user-joined', (data) => {
        const uid = data.userId || data.user?._id || data.user;
        if (!uid) return;
        setParticipants((prev) => {
          const exists = prev.find(
            (p) => (p.user?._id || p.user || p._id) === uid
          );
          if (exists) return prev;
          return [...prev, { user: { _id: uid, username: data.username }, role: data.role || 'viewer' }];
        });
        setOnlineMap((prev) => ({ ...prev, [uid]: true }));
      });

      socket.on('participant-role-updated', (data) => {
        const uid = data.userId || data.user?._id || data.user;
        if (!uid) return;
        const nextRole = data.role || 'viewer';
        setParticipants((prev) =>
          prev.map((p) => {
            const pid = p.user?._id || p.user || p._id;
            if (pid && String(pid) === String(uid)) {
              return { ...p, role: nextRole };
            }
            return p;
          })
        );
      });

      socket.on('user-kicked', (data) => {
        const uid = data.userId || data.user?._id || data.user;
        if (!uid) return;
        setParticipants((prev) => prev.filter((p) => String(p.user?._id || p.user || p._id) !== String(uid)));
        setOnlineMap((prev) => {
          const next = { ...prev };
          delete next[uid];
          return next;
        });
      });

      socket.on('kicked', (data) => {
        if (data?.roomId && String(data.roomId) !== String(roomId)) return;
        alert('You were removed from the room by an admin.');
        try {
          socketRef.current?.disconnect();
        } catch (e) {}
        navigate(`/repository/${room?.repository?._id || ''}`);
      });

      socket.on('file-presence', (data) => {
        const fid = data?.fileId;
        if (!fid) return;
        const users = Array.isArray(data.users) ? data.users : [];
        setActiveUsersByFile((prev) => ({ ...prev, [fid]: users }));
      });

      socket.on('room-activity', (evt) => {
        if (!evt) return;
        
        // Create a unique key for deduplication using type, message, actorUsername, and createdAt
        const createdAt = evt.createdAt || new Date().toISOString();
        const activityKey = `${evt.type || 'unknown'}-${evt.message || ''}-${evt.actorUsername || ''}-${createdAt}`;
        
        // Skip if we've already seen this activity
        if (seenActivitiesRef.current.has(activityKey)) {
          console.log('Activity already seen, skipping duplicate:', activityKey);
          return;
        }
        
        // Mark as seen
        seenActivitiesRef.current.add(activityKey);
        
        // Clean up old keys to prevent memory issues (keep last 500)
        if (seenActivitiesRef.current.size > 500) {
          const keysArray = Array.from(seenActivitiesRef.current);
          keysArray.slice(0, seenActivitiesRef.current.size - 500).forEach(k => seenActivitiesRef.current.delete(k));
        }
        
        setActivity((prev) => {
          // Also check if the activity is already in the state array to prevent duplicates
          const alreadyExists = prev.some(a => {
            const aKey = `${a.type || 'unknown'}-${a.message || ''}-${a.actorUsername || ''}-${a.createdAt || ''}`;
            return aKey === activityKey;
          });
          
          if (alreadyExists) {
            console.log('Activity already in state, skipping:', activityKey);
            return prev;
          }
          
          const next = [{ ...evt, createdAt }, ...prev];
          return next.slice(0, 200);
        });
      });

      socket.on('user-left', (data) => {
        const uid = data.userId || data.user?._id || data.user;
        if (!uid) return;
        setOnlineMap((prev) => ({ ...prev, [uid]: false }));
      });

      socket.on('code-update', (data) => {
        if (data.userId === currentUserId) return;
        const targetId = currentFileIdRef.current || 'shared';
        if (data.fileId && data.fileId !== targetId) return;
        isRemoteUpdate.current = true;
        setCode(data.content);
      });

      socket.on('cursor-update', (data) => {
        if (data.userId === currentUserId) return;
        if (!data.position) return;
        const targetId = currentFileIdRef.current || 'shared';
        if (data.fileId && data.fileId !== targetId) return;
        setRemoteCursors((prev) => ({
          ...prev,
          [data.userId]: { position: data.position, username: data.username || data.userId }
        }));
      });

      socket.on('drawing-sync', (drawingData) => {
        if (!fabricRef.current) return;
        const canvas = fabricRef.current;
        if (drawingData.type === 'clear') {
          canvas.clear();
          canvas.set('backgroundColor', '#1e1f26');
          canvas.requestRenderAll();
          historyStackRef.current = [];
          redoStackRef.current = [];
          return;
        }
        if (drawingData.type === 'state' && Array.isArray(drawingData.paths)) {
          redrawFromHistory(drawingData.paths);
          historyStackRef.current = [...drawingData.paths];
          redoStackRef.current = [];
          return;
        }
        if (drawingData.type === 'state-request') {
          if (historyStackRef.current.length > 0) {
            socketRef.current?.emit('drawing-update', {
              roomId,
              drawingData: { type: 'state', paths: historyStackRef.current },
              userId: currentUserId
            });
          }
          return;
        }
        if (drawingData.type === 'path' && drawingData.path) {
          if (drawingData.userId && drawingData.userId === currentUserId) return;
          if (!drawingData.path.strokeId) {
            drawingData.path.strokeId = generateStrokeId();
          }
          
          // Check if this strokeId already exists in history (prevent duplicates)
          const exists = historyStackRef.current.some(p => p.strokeId === drawingData.path.strokeId);
          if (exists) return;
          
          util.enlivenObjects([drawingData.path], (objs) => {
            objs.forEach((o) => {
              if (drawingData.path.strokeId) {
                o.set('strokeId', drawingData.path.strokeId);
              }
              canvas.add(o);
            });
            canvas.renderAll();
          });
          historyStackRef.current.push(drawingData.path);
          redoStackRef.current = [];
          setCanUndo(true);
          setCanRedo(false); // Clear redo when new stroke is drawn
          ensureDrawingMode();
          return;
        }
        if (drawingData.type === 'undo-one' && drawingData.path) {
          const canvas = fabricRef.current;
          const strokeId = drawingData.path?.strokeId;
          
          // Prevent double processing - check if we've already handled this undo
          if (lastUndoneStrokeIdRef.current === strokeId) return;
          
          // For our own undo, skip (we already handled it locally)
          if (drawingData.userId && drawingData.userId === currentUserId) {
            lastUndoneStrokeIdRef.current = strokeId;
            setTimeout(() => {
              lastUndoneStrokeIdRef.current = null;
            }, 1000);
            return;
          }
          
          const objects = canvas.getObjects();
          
          // Find and remove the object with matching strokeId, or the last object if no match
          let removed = false;
          if (strokeId && objects.length > 0) {
            // Search from the end (most recent first)
            for (let i = objects.length - 1; i >= 0; i--) {
              const obj = objects[i];
              const objStrokeId = obj.get?.('strokeId') || obj.strokeId;
              if (objStrokeId === strokeId) {
                canvas.remove(obj);
                canvas.renderAll();
                removed = true;
                break;
              }
            }
          }
          
          // If not found by strokeId, remove the last object
          if (!removed && objects.length > 0) {
            const lastObject = objects[objects.length - 1];
            canvas.remove(lastObject);
            canvas.renderAll();
            removed = true;
          }
          
          if (removed) {
            // Track this undo to prevent double processing
            lastUndoneStrokeIdRef.current = strokeId;
            setTimeout(() => {
              lastUndoneStrokeIdRef.current = null;
            }, 1000);
            
            // Remove only ONE entry from history stack
            if (historyStackRef.current.length > 0) {
              historyStackRef.current = historyStackRef.current.slice(0, -1);
            }
            // Add to redo stack
            redoStackRef.current.push(drawingData.path);
          }
          
          ensureDrawingMode();
          return;
        }
        if (drawingData.type === 'redo-one' && drawingData.path) {
          const canvas = fabricRef.current;
          const strokeId = drawingData.path?.strokeId;
          
          // Prevent double processing - check if we've already handled this redo
          if (lastRedoneStrokeIdRef.current === strokeId) return;
          
          // For our own redo, skip (we already handled it locally)
          if (drawingData.userId && drawingData.userId === currentUserId) {
            lastRedoneStrokeIdRef.current = strokeId;
            setTimeout(() => {
              lastRedoneStrokeIdRef.current = null;
            }, 1000);
            return;
          }
          
          // Track this redo to prevent double processing
          lastRedoneStrokeIdRef.current = strokeId;
          setTimeout(() => {
            lastRedoneStrokeIdRef.current = null;
          }, 1000);
          
          // Remove from redo stack if it exists
          if (redoStackRef.current.length > 0) {
            const lastRedoIndex = redoStackRef.current.findIndex(p => p.strokeId === strokeId);
            if (lastRedoIndex !== -1) {
              redoStackRef.current.splice(lastRedoIndex, 1);
            } else {
              // If not found by strokeId, just pop the last one
              redoStackRef.current.pop();
            }
          }
          
          // Add back to history
          historyStackRef.current.push(drawingData.path);
          
          // Update UI state
          setCanRedo(redoStackRef.current.length > 0);
          setCanUndo(true);
          
          // Restore the path on canvas
          util.enlivenObjects([drawingData.path], (objs) => {
            if (!objs || objs.length === 0) {
              // Fallback: create path directly
              try {
                const restoredPath = Path.fromObject(drawingData.path);
                if (drawingData.path.strokeId) {
                  restoredPath.set('strokeId', drawingData.path.strokeId);
                }
                canvas.add(restoredPath);
                canvas.renderAll();
              } catch (err) {
                console.error('Failed to restore remote redo path:', err);
              }
              return;
            }
            objs.forEach((o) => {
              if (drawingData.path.strokeId) {
                o.set('strokeId', drawingData.path.strokeId);
              }
              canvas.add(o);
            });
            canvas.renderAll();
          });
          
          ensureDrawingMode();
          return;
        }
      });

      socket.on('files-updated', async () => {
        if (repositoryIdRef.current) {
          await fetchFiles(repositoryIdRef.current, false);
        }
      });

      const messagesResponse = await axios.get(`/rooms/${roomId}/messages`);
      setMessages(messagesResponse.data.messages);

      // Clear seen activities when initializing room
      seenActivitiesRef.current.clear();

      // Fetch activity log
      try {
        const activityRes = await axios.get(`/rooms/${roomId}/activity`, { params: { limit: 150 } });
        const initialActivity = activityRes.data.activity || [];
        setActivity(initialActivity);
        
        // Mark all initial activities as seen to prevent duplicates
        initialActivity.forEach((a: any) => {
          const createdAt = a.createdAt || new Date().toISOString();
          const activityKey = `${a.type || 'unknown'}-${a.message || ''}-${a.actorUsername || ''}-${createdAt}`;
          seenActivitiesRef.current.add(activityKey);
        });
      } catch (e) {
        // ignore
      }

      // setupWhiteboard will be called via useEffect when canvas is ready
    } catch (error) {
      console.error('Failed to join room:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  // Set up whiteboard when canvas ref is available
  useEffect(() => {
    if (loading || !room) return;
    
    // Use a small timeout to ensure the canvas element is mounted
    const timer = setTimeout(() => {
      if (canvasRef.current && !fabricRef.current) {
        setupWhiteboard();
        // ensureDrawingMode is called inside setupWhiteboard, but call it again to be sure
        ensureDrawingMode();
      }
    }, 100);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, room]);

  const fetchFiles = async (repositoryId, selectFirstIfNone = true) => {
    try {
      const response = await axios.get(`/files/repository/${repositoryId}`);
      setFiles(response.data.files);
      // Auto-select first non-folder if none selected
      if (selectFirstIfNone && !currentFileIdRef.current) {
        const firstFile = findFirstFile(response.data.files);
        if (firstFile) {
          await loadFile(firstFile._id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  };

  const findFirstFile = (fileList) => {
    for (const f of fileList) {
      if (!f.isFolder) return f;
      if (f.children && f.children.length) {
        const nested = findFirstFile(f.children);
        if (nested) return nested;
      }
    }
    return null;
  };

  const loadFile = async (fileId) => {
    try {
      // blur previous
      if (focusedFileIdRef.current && socketRef.current) {
        socketRef.current.emit('file-blur', { roomId, fileId: focusedFileIdRef.current, userId: currentUserId, username: user?.username });
      }
      const response = await axios.get(`/files/${fileId}`);
      setCurrentFile(response.data.file);
      currentFileIdRef.current = response.data.file._id;
      setCode(response.data.file.content || '');
      // focus new
      focusedFileIdRef.current = response.data.file._id;
      socketRef.current?.emit('file-focus', { roomId, fileId: focusedFileIdRef.current, userId: currentUserId, username: user?.username });

      // Fetch lightweight history to show who made changes (visible to everyone with room access)
      try {
        const hist = await axios.get(`/files/${fileId}/history`, { params: { limit: 50 } });
        const revisions = hist.data?.revisions || [];
        const names = [];
        const seen = new Set();
        for (const r of revisions) {
          const n = r.createdBy?.username || r.createdBy?.toString?.() || null;
          if (n && !seen.has(n)) {
            seen.add(n);
            names.push(n);
          }
        }
        setContributorsByFile((prev) => ({ ...prev, [fileId]: names }));
      } catch (e) {
        // ignore (still show lastModifiedBy)
      }
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const handleFileSelect = async (file) => {
    if (file.isFolder) return;
    try {
      await loadFile(file._id);
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const handleFileCreate = async (fileData) => {
    if (isViewer) {
      alert('Viewers cannot create files or folders.');
      return;
    }
    if (!room?.repository?._id) return;
    try {
      const response = await axios.post('/files', {
        ...fileData,
        repositoryId: room.repository._id,
        roomId
      });
      // Select the newly created file if it's not a folder
      if (!response.data.file?.isFolder && response.data.file?._id) {
        await loadFile(response.data.file._id);
      }
      await fetchFiles(room.repository._id);
      setShowCreateModal(false);
      socketRef.current?.emit('files-updated', { roomId });
      // refresh activity
      try {
        const activityRes = await axios.get(`/rooms/${roomId}/activity`, { params: { limit: 150 } });
        setActivity(activityRes.data.activity || []);
      } catch (e) {}
    } catch (error) {
      console.error('Failed to create file:', error.response?.data || error.message);
      alert(error.response?.data?.message || 'Failed to create file');
    }
  };

  const handleFileDelete = async (fileId) => {
    if (isViewer) {
      alert('Viewers cannot delete files or folders.');
      return;
    }
    if (!window.confirm('Delete this file?')) return;
    try {
      await axios.delete(`/files/${fileId}`, { data: { repositoryId: room.repository._id, roomId } });
      await fetchFiles(room.repository._id);
      if (currentFile && currentFile._id === fileId) {
        setCurrentFile(null);
        setCode('// Shared code\n');
      }
      socketRef.current?.emit('files-updated', { roomId });
      // refresh activity
      try {
        const activityRes = await axios.get(`/rooms/${roomId}/activity`, { params: { limit: 150 } });
        setActivity(activityRes.data.activity || []);
      } catch (e) {}
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file');
    }
  };

  const setupWhiteboard = () => {
    if (!canvasRef.current) {
      console.warn('Canvas ref not available, cannot set up whiteboard');
      return;
    }
    
    // Dispose existing canvas if any
    if (fabricRef.current) {
      fabricRef.current.dispose();
    }
    
    const canvas = new Canvas(canvasRef.current, {
      isDrawingMode: !isViewer,
      backgroundColor: '#1e1f26'
    });
    const { width, height } = computeCanvasSize();
    canvas.setHeight(height);
    canvas.setWidth(width);
    canvas.isDrawingMode = !isViewer;
    canvas.selection = false;
    // Ensure a drawing brush is set - use refs for current values (editors/admins only)
    if (!isViewer) {
      brushColorRef.current = brushColor;
      brushSizeRef.current = brushSize;
      canvas.freeDrawingBrush = new PencilBrush(canvas);
      canvas.freeDrawingBrush.color = brushColorRef.current;
      canvas.freeDrawingBrush.width = brushSizeRef.current;
      canvas.freeDrawingBrush.decimate = 0;
    }

    canvas.on('mouse:down', () => {
      ensureDrawingMode();
    });

    canvas.on('path:created', (e) => {
      if (isViewer) return;
      const path = e.path;
      // Check if this path already has a strokeId (prevent duplicate processing)
      if (path.get?.('strokeId') || path.strokeId) return;
      
      const strokeId = generateStrokeId();
      path.set('strokeId', strokeId);
      // Serialize with all necessary properties for proper restoration
      // Include 'type' so Path.fromObject knows what type of object it is
      const serialized = path.toObject([
        'type', 'path', 'fill', 'stroke', 'strokeWidth', 'strokeId',
        'left', 'top', 'width', 'height', 'scaleX', 'scaleY',
        'angle', 'opacity', 'shadow', 'strokeLineCap', 'strokeLineJoin',
        'strokeDashArray', 'strokeMiterLimit', 'strokeDashOffset'
      ]);
      
      // Check if this strokeId already exists in history (prevent duplicates)
      const exists = historyStackRef.current.some(p => p.strokeId === strokeId);
      if (!exists) {
        // push to history
        historyStackRef.current.push(serialized);
        redoStackRef.current = [];
        setCanUndo(true);
        setCanRedo(false); // Clear redo when new stroke is drawn
        socketRef.current?.emit('drawing-update', {
          roomId,
          drawingData: { type: 'path', path: serialized },
          userId: currentUserId
        });
      }
    });

    ensureDrawingMode();

    fabricRef.current = canvas;

    // Request existing board state from others
    socketRef.current?.emit('drawing-update', {
      roomId,
      drawingData: { type: 'state-request' },
      userId: currentUserId
    });
  };

  // Update brush refs when state changes
  useEffect(() => {
    brushColorRef.current = brushColor;
  }, [brushColor]);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  // Resize whiteboard when window resizes
  useEffect(() => {
    const handleResize = () => {
      if (!fabricRef.current || !canvasRef.current) return;
      const { width, height } = computeCanvasSize();
      fabricRef.current.setWidth(width);
      fabricRef.current.setHeight(height);
      fabricRef.current.renderAll();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isViewer) {
      alert('Viewers cannot upload images.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    setImageFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !imageFile) || !socketRef.current) return;
    if (!currentUserId) return;
    if (isViewer) {
      alert('Viewers cannot send messages.');
      return;
    }
    if (isSendingMessageRef.current) {
      console.log('Message send already in progress, ignoring duplicate call');
      return; // Prevent duplicate sends
    }
    isSendingMessageRef.current = true;
    setIsSendingMessage(true);
    console.log('Starting to send message, isSendingMessageRef set to true');

    try {
      let imageData = null;
      if (imageFile) {
        // Convert image to base64
        const reader = new FileReader();
        imageData = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const result = reader.result as string;
            console.log('Image converted to base64, length:', result?.length);
            resolve(result);
          };
          reader.onerror = (err) => {
            console.error('Error reading image file:', err);
            reject(err);
          };
          reader.readAsDataURL(imageFile);
        });
      }

      // Build message data object
      const messageData: {
        roomId: string;
        message: string;
        userId: string;
        username: string;
        image?: string;
        imageName?: string | null;
        messageType?: string;
      } = {
        roomId,
        message: newMessage.trim() || '',
        userId: currentUserId,
        username: user.username
      };
      
      // Add image data if it exists
      if (imageData) {
        messageData.image = imageData;
        messageData.imageName = imageFile?.name || null;
        messageData.messageType = 'image';
      } else {
        messageData.messageType = 'text';
      }

      // Content-based signature guard (prevents duplicate sends from double-triggered events)
      const sig = [
        messageData.userId,
        messageData.messageType,
        messageData.imageName || '',
        messageData.image ? messageData.image.length : 0,
        messageData.message || ''
      ].join('|');
      const now = Date.now();
      if (lastSendSignatureRef.current.sig === sig && (now - lastSendSignatureRef.current.at) < 2000) {
        console.log('Duplicate send detected (same signature within 2s), skipping', { sig: sig.substring(0, 120) });
        return;
      }
      lastSendSignatureRef.current = { sig, at: now };

      console.log('Sending message data:', {
        hasImage: !!imageData,
        imageLength: imageData?.length,
        messageType: messageData.messageType,
        imageName: messageData.imageName,
        message: messageData.message,
        imageDataExists: !!messageData.image,
        imagePreview: imageData ? imageData.substring(0, 50) + '...' : null,
        messageDataKeys: Object.keys(messageData)
      });

      // Add optimistic update for sender (immediate feedback)
      // (With signature guard above, double-triggered events won't create duplicates)
      const optimisticTimestamp = new Date().toISOString();
      const messageId = `${currentUserId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Mark this message ID as pending (defensive)
      pendingMessageIdsRef.current.add(messageId);
      
      const optimisticMessage = {
        _id: messageId,
        username: user.username,
        userId: currentUserId,
        content: messageData.message,
        image: messageData.image || null,
        imageName: messageData.imageName || null,
        messageType: messageData.messageType,
        timestamp: optimisticTimestamp
      };
      
      setMessages((prev) => {
        const alreadyExists = prev.some((m) => m._id === messageId);
        if (alreadyExists) return prev;
        return [...prev, optimisticMessage];
      });

      // Emit
      socketRef.current.emit('send-message', messageData, (response) => {
        console.log('Socket emit callback:', response);
      });

      setNewMessage('');
      removeImage();
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      isSendingMessageRef.current = false;
      setIsSendingMessage(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isViewer) return;
      sendMessage();
    }
  };

  const leaveRoom = async () => {
    if (socketRef.current) {
      socketRef.current.emit('leave-room', {
        roomId,
        userId: currentUserId,
        username: user.username
      });
    }
    navigate(`/repository/${room?.repository?._id || ''}`);
  };

  const handleCopyInvite = async () => {
    const url = roomId;
    try {
      await navigator.clipboard.writeText(url);
      alert('Room ID copied to clipboard');
    } catch (err) {
      console.error('Failed to copy invite link:', err);
      alert(url); // fallback: show the ID to copy manually
    }
  };

  const handleRefreshFiles = async () => {
    if (repositoryIdRef.current) {
      await fetchFiles(repositoryIdRef.current, false);
    }
  };

  const openEditModal = (file) => {
    if (isViewer) {
      alert('Viewers cannot rename or move files/folders.');
      return;
    }
    setEditTarget(file);
    setEditName(file.name || '');
    setEditParent(file.parentFolder || '');
    setShowEditModal(true);
  };

  const flattenFolders = (fileList) => {
    const result = [];
    const dfs = (items) => {
      items.forEach((f) => {
        if (f.isFolder) {
          result.push(f);
          if (f.children && f.children.length) dfs(f.children);
        }
      });
    };
    dfs(fileList);
    return result;
  };

  const handleRenameMove = async () => {
    if (isViewer) {
      alert('Viewers cannot rename or move files/folders.');
      return;
    }
    if (!editTarget || !room?.repository?._id) return;
    try {
      await axios.put(`/files/${editTarget._id}`, {
        name: editName,
        parentFolder: editParent || null,
        repositoryId: room.repository._id,
        roomId
      });
      await fetchFiles(room.repository._id, false);
      setShowEditModal(false);
      setEditTarget(null);
      // refresh activity
      try {
        const activityRes = await axios.get(`/rooms/${roomId}/activity`, { params: { limit: 150 } });
        setActivity(activityRes.data.activity || []);
      } catch (e) {}
    } catch (error) {
      console.error('Failed to rename/move file:', error.response?.data || error.message);
      alert(error.response?.data?.message || 'Failed to rename/move file');
    }
  };

  const getParticipantRole = (participant) => {
    const uid = participant.user?._id || participant.user;
    const isOwner =
      room?.repository?.owner?.toString?.() === uid ||
      room?.repository?.owner === uid ||
      room?.host?.toString?.() === uid;
    if (isOwner) return 'owner';
    return participant.role || 'viewer';
  };

  const roleLabel = (role) => {
    if (role === 'owner') return 'Owner';
    if (role === 'admin') return 'Admin';
    if (role === 'editor') return 'Editor';
    return 'Viewer';
  };

  const requestRoleChange = (targetUserId, nextRole) => {
    if (!canManageParticipants || !socketRef.current) return;
    socketRef.current.emit('update-participant-role', { roomId, targetUserId, role: nextRole }, (res) => {
      if (res && res.ok === false) {
        alert(res.error || 'Failed to update role');
      }
    });
  };

  const requestKick = (targetUserId) => {
    if (!canManageParticipants || !socketRef.current) return;
    if (!window.confirm('Remove this user from the room?')) return;
    socketRef.current.emit('kick-user', { roomId, targetUserId }, (res) => {
      if (res && res.ok === false) {
        alert(res.error || 'Failed to remove user');
      }
    });
  };

  const handleDownloadZip = async () => {
    if (!room?.repository?._id) return;
    try {
      const res = await axios.get(`/repositories/${room.repository._id}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${room.repository.name || 'repository'}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download ZIP:', error);
      alert('Failed to download repository ZIP');
    }
  };

  const handleCopilotAction = (action: 'Generate' | 'Insert' | 'Replace' | 'Suggest') => {
    if (isViewer) {
      alert('Viewers cannot use AI Copilot.');
      return;
    }
    setCopilotAction(action);
    setShowCopilotMenu(false);
    setShowCopilotModal(true);
  };

  const handleCopilotApply = (generatedCode: string) => {
    if (!editorRef.current) {
      // Fallback if editor not available, just update state
      const currentCode = code || '';
      const newCode = currentCode + (currentCode ? '\n\n' : '') + generatedCode;
      setCode(newCode);
      return;
    }

    const editor = editorRef.current;
    const selection = editor.getSelection();
    const monaco = monacoRef.current;
    
    try {
      switch (copilotAction) {
        case 'Generate':
          // Append at the end
          const currentCode = code || '';
          const newCode = currentCode + (currentCode ? '\n\n' : '') + generatedCode;
          setCode(newCode);
          editor.setValue(newCode);
          break;

        case 'Insert':
          // Insert at cursor position
          if (selection && monaco) {
            const range = new monaco.Range(
              selection.positionLineNumber,
              selection.positionColumn,
              selection.positionLineNumber,
              selection.positionColumn
            );
            editor.executeEdits('copilot-insert', [{
              range,
              text: generatedCode
            }]);
            const model = editor.getModel();
            if (model) {
              setCode(model.getValue());
            }
          } else {
            // No selection, append at end
            const currentCode2 = code || '';
            const newCode2 = currentCode2 + (currentCode2 ? '\n\n' : '') + generatedCode;
            setCode(newCode2);
            editor.setValue(newCode2);
          }
          break;

        case 'Replace':
          // Replace selection
          if (selection && !selection.isEmpty() && monaco) {
            const range = new monaco.Range(
              selection.startLineNumber,
              selection.startColumn,
              selection.endLineNumber,
              selection.endColumn
            );
            editor.executeEdits('copilot-replace', [{
              range,
              text: generatedCode
            }]);
            // Update code state
            const model = editor.getModel();
            if (model) {
              setCode(model.getValue());
            }
          } else {
            // No selection, append at end
            const currentCode3 = code || '';
            const newCode3 = currentCode3 + (currentCode3 ? '\n\n' : '') + generatedCode;
            setCode(newCode3);
            editor.setValue(newCode3);
          }
          break;

        case 'Suggest':
          // For suggest, we'll insert at cursor or append
          if (selection && monaco) {
            const range = new monaco.Range(
              selection.positionLineNumber,
              selection.positionColumn,
              selection.positionLineNumber,
              selection.positionColumn
            );
            editor.executeEdits('copilot-suggest', [{
              range,
              text: generatedCode
            }]);
            const model = editor.getModel();
            if (model) {
              setCode(model.getValue());
            }
          } else {
            const currentCode4 = code || '';
            const newCode4 = currentCode4 + (currentCode4 ? '\n\n' : '') + generatedCode;
            setCode(newCode4);
            editor.setValue(newCode4);
          }
          break;
      }

      // Save the file if it's a repository file
      if (currentFile?._id && room?.repository?._id) {
        const finalCode = editor.getValue();
        axios.put(`/files/${currentFile._id}`, {
          content: finalCode,
          repositoryId: room.repository._id,
          roomId
        }).catch((err) => {
          console.error('Failed to save file after copilot edit:', err);
        });
      }
    } catch (error) {
      console.error('Error applying copilot code:', error);
      // Fallback: just append to code
      const currentCodeFallback = code || '';
      const newCodeFallback = currentCodeFallback + (currentCodeFallback ? '\n\n' : '') + generatedCode;
      setCode(newCodeFallback);
      if (editor) {
        editor.setValue(newCodeFallback);
      }
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close copilot dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showCopilotMenu && !(event.target as HTMLElement).closest('.copilot-menu')) {
        setShowCopilotMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCopilotMenu]);

  // Deduplicate messages before rendering
  const uniqueMessages = useMemo(() => {
    const seen = new Set();
    const seenByContent = new Set();
    return messages.filter((msg) => {
      // First check by unique ID if available
      if (msg._id) {
        if (seen.has(msg._id)) {
          console.log('Filtering duplicate message by ID:', msg._id);
          return false;
        }
        seen.add(msg._id);
        return true;
      }
      
      // For messages without ID, create a unique key
      let msgId;
      if (msg.image) {
        // For images, use userId, timestamp, and image hash
        const imageHash = msg.image.length > 100 
          ? `${msg.image.substring(0, 50)}-${msg.image.substring(msg.image.length - 50)}`
          : msg.image;
        msgId = `${msg.userId || msg.username}-${msg.timestamp}-img-${imageHash.length}`;
      } else {
        msgId = `${msg.userId || msg.username}-${msg.timestamp}-${(msg.content || '').substring(0, 100)}`;
      }
      
      // Also check by content hash for additional safety
      const contentKey = msg.image 
        ? `img-${msg.userId || msg.username}-${msg.imageName || ''}-${msg.image.length}`
        : `text-${msg.userId || msg.username}-${msg.content || ''}`;
      
      if (seen.has(msgId) || seenByContent.has(contentKey)) {
        console.log('Filtering duplicate message:', msgId.substring(0, 80), 'or content:', contentKey.substring(0, 80));
        return false;
      }
      seen.add(msgId);
      seenByContent.add(contentKey);
      return true;
    });
  }, [messages]);

  const fileNameById = useMemo(() => {
    const map = {};
    const walk = (items) => {
      (items || []).forEach((f) => {
        if (f?._id) {
          map[f._id] = f.path || f.name || 'Unknown file';
        }
        if (f?.children?.length) walk(f.children);
      });
    };
    walk(files);
    return map;
  }, [files]);

  const whoIsOnWhat = useMemo(() => {
    const entries: Array<{ fileId: string; filename: string; names: string[] }> = [];
    Object.entries(activeUsersByFile || {}).forEach(([fileId, users]) => {
      if (!users || users.length === 0) return;
      const filename = fileNameById[fileId] || 'Unknown file';
      const names = users.map((u) => u.username || u.userId).filter(Boolean);
      if (names.length === 0) return;
      entries.push({ fileId, filename, names });
    });
    // stable-ish ordering: by filename
    entries.sort((a, b) => a.filename.localeCompare(b.filename));
    return entries;
  }, [activeUsersByFile, fileNameById]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const monaco = monacoRef.current;
    const decorations = Object.entries(remoteCursors).map(([uid, data]) => {
      const pos = data.position;
      const color = getCursorColor(uid);
      const label = data.username || uid;
      return {
        range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column + 1),
        options: {
          inlineClassName: 'remote-cursor-inline',
          hoverMessage: { value: `Editing: ${label}` },
          after: {
            contentText: ` ● ${label}`,
            inlineClassName: 'remote-cursor-label'
          },
          minimap: {
            color,
            position: 1
          }
        }
      };
    });

    const decorationIds = editorRef.current.deltaDecorations([], decorations);
    return () => editorRef.current?.deltaDecorations(decorationIds, []);
  }, [remoteCursors]);

  const handleEditorChange = (value) => {
    setCode(value);
    if (isViewer) return; // viewers cannot modify
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    socketRef.current?.emit('code-change', {
      roomId,
      fileId: currentFileIdRef.current || 'shared',
      content: value,
      userId: currentUserId
    });
    // Persist to backend if a repository file is open
    if (currentFileIdRef.current && room?.repository?._id) {
      axios.put(`/files/${currentFileIdRef.current}`, { content: value, repositoryId: room.repository._id, roomId }).catch((err) => {
        console.error('Failed to persist file content:', err.response?.data || err.message);
      });
    }
  };

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((e) => {
      const position = e.position;
      socketRef.current?.emit('cursor-move', {
        roomId,
        userId: currentUserId,
        username: user.username,
        fileId: currentFileIdRef.current || 'shared',
        position
      });
    });
  };

  // Cleanup file presence on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current && focusedFileIdRef.current) {
        socketRef.current.emit('file-blur', { roomId, fileId: focusedFileIdRef.current, userId: currentUserId, username: user?.username });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearWhiteboard = () => {
    if (isViewer) return;
    if (!fabricRef.current) return;
    fabricRef.current.clear();
    fabricRef.current.set('backgroundColor', '#1e1f26');
    fabricRef.current.requestRenderAll();
    ensureDrawingMode();
    historyStackRef.current = [];
    redoStackRef.current = [];
    socketRef.current?.emit('drawing-update', {
      roomId,
      drawingData: { type: 'clear' }
    });
  };

  const handleBrushColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isViewer) return;
    const color = e.target.value;
    setBrushColor(color);
    brushColorRef.current = color;
    if (fabricRef.current?.freeDrawingBrush) {
      fabricRef.current.freeDrawingBrush.color = color;
      fabricRef.current.isDrawingMode = true;
    }
  };

  const handleBrushSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isViewer) return;
    const size = Number(e.target.value) || 1;
    setBrushSize(size);
    brushSizeRef.current = size;
    if (fabricRef.current?.freeDrawingBrush) {
      fabricRef.current.freeDrawingBrush.width = size;
      fabricRef.current.isDrawingMode = true;
    }
  };

  const ensureDrawingMode = () => {
    if (isViewer) return;
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    // Always reassign brush to avoid stale/null brushes after clear/state sync
    // Use refs to get current values instead of stale closure values
    canvas.freeDrawingBrush = new PencilBrush(canvas);
    canvas.freeDrawingBrush.color = brushColorRef.current;
    canvas.freeDrawingBrush.width = brushSizeRef.current;
    canvas.freeDrawingBrush.decimate = 0;
    canvas.isDrawingMode = true;
    canvas.selection = false;
  };

  const generateStrokeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const removeStrokeFromHistory = (strokeId) => {
    if (!strokeId) {
      historyStackRef.current = historyStackRef.current.slice(0, -1);
      return;
    }
    const idx = [...historyStackRef.current]
      .map((p, i) => ({ i, sid: p.strokeId }))
      .reverse()
      .find((p) => p.sid === strokeId)?.i;
    if (idx !== undefined) {
      historyStackRef.current = historyStackRef.current.filter((_, i) => i !== idx);
    } else {
      historyStackRef.current = historyStackRef.current.slice(0, -1);
    }
  };

  // Rebuild the whiteboard from the provided history paths
  const redrawFromHistory = (paths = []) => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    canvas.clear();
    canvas.set('backgroundColor', '#1e1f26');
    canvas.requestRenderAll();
    paths.forEach((p) => {
      util.enlivenObjects([p], (objs) => {
        objs.forEach((o) => {
          if (p.strokeId) o.set('strokeId', p.strokeId);
          canvas.add(o);
        });
        canvas.renderAll();
      });
    });
    ensureDrawingMode();
  };

  const handleUndo = () => {
    if (isViewer) return;
    if (!fabricRef.current || historyStackRef.current.length === 0) return;
    const canvas = fabricRef.current;
    const objects = canvas.getObjects();
    if (objects.length === 0) return;
    
    // Get the last history entry
    const lastPath = historyStackRef.current[historyStackRef.current.length - 1];
    const strokeId = lastPath?.strokeId;
    
    // Prevent double processing
    if (lastUndoneStrokeIdRef.current === strokeId) return;
    
    // Find and remove the object with matching strokeId, or the last object if no match
    let removed = false;
    if (strokeId) {
      // Search from the end (most recent first)
      for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        const objStrokeId = obj.get?.('strokeId') || obj.strokeId;
        if (objStrokeId === strokeId) {
          canvas.remove(obj);
          canvas.renderAll();
          removed = true;
          break;
        }
      }
    }
    
    // If not found by strokeId, remove the last object
    if (!removed && objects.length > 0) {
      const lastObject = objects[objects.length - 1];
      canvas.remove(lastObject);
      canvas.renderAll();
      removed = true;
    }
    
    if (removed) {
      // Track this undo to prevent double processing
      lastUndoneStrokeIdRef.current = strokeId;
      setTimeout(() => {
        lastUndoneStrokeIdRef.current = null;
      }, 1000); // Clear after 1 second
      
      // Update history and redo stacks - remove only ONE entry
      redoStackRef.current.push(lastPath);
      historyStackRef.current = historyStackRef.current.slice(0, -1);
      
      // Update UI state
      setCanRedo(true);
      setCanUndo(historyStackRef.current.length > 0);
      
      // Broadcast undo event
      socketRef.current?.emit('drawing-update', {
        roomId,
        drawingData: { type: 'undo-one', path: lastPath },
        userId: currentUserId
      });
    }
    
    ensureDrawingMode();
  };

  const handleRedo = () => {
    if (isViewer) return;
    if (!fabricRef.current || redoStackRef.current.length === 0) return;
    
    // Pop from redo stack
    const redonePath = redoStackRef.current.pop();
    if (!redonePath) return;
    
    const strokeId = redonePath?.strokeId;
    
    // Prevent double processing
    if (strokeId && lastRedoneStrokeIdRef.current === strokeId) {
      // Put it back
      redoStackRef.current.push(redonePath);
      return;
    }
    
    // Track this redo to prevent double processing
    if (strokeId) {
      lastRedoneStrokeIdRef.current = strokeId;
      setTimeout(() => {
        lastRedoneStrokeIdRef.current = null;
      }, 1000); // Clear after 1 second
    }
    
    // Add back to history
    historyStackRef.current.push(redonePath);
    
    // Update UI state
    setCanRedo(redoStackRef.current.length > 0);
    setCanUndo(true);
    
    // Restore the path on canvas
    const canvas = fabricRef.current;
    
    console.log('Attempting to restore path:', redonePath);
    
    // Try using classRegistry to properly deserialize
    try {
      const PathClass = classRegistry.getClass(redonePath.type || 'Path');
      if (PathClass && PathClass.fromObject) {
        PathClass.fromObject(redonePath).then((restoredPath) => {
          if (redonePath.strokeId) {
            restoredPath.set('strokeId', redonePath.strokeId);
          }
          canvas.add(restoredPath);
          canvas.renderAll();
          console.log('Path restored successfully using fromObject');
        }).catch((err) => {
          console.error('fromObject failed, trying enlivenObjects:', err);
          // Fallback to enlivenObjects
          util.enlivenObjects([redonePath], (objs) => {
            console.log('enlivenObjects callback called with:', objs);
            if (!objs || objs.length === 0) {
              console.error('enlivenObjects returned no objects');
              return;
            }
            objs.forEach((o) => {
              if (redonePath.strokeId && typeof o.set === 'function') {
                o.set('strokeId', redonePath.strokeId);
              }
              canvas.add(o);
            });
            canvas.renderAll();
            console.log('Path restored using enlivenObjects');
          });
        });
      } else {
        throw new Error('PathClass or fromObject not available');
      }
    } catch (err) {
      console.error('classRegistry approach failed, using enlivenObjects:', err);
      // Fallback to enlivenObjects
      util.enlivenObjects([redonePath], (objs) => {
        console.log('enlivenObjects callback called with:', objs);
        if (!objs || objs.length === 0) {
          console.error('enlivenObjects returned no objects');
          return;
        }
        objs.forEach((o) => {
          if (redonePath.strokeId && typeof o.set === 'function') {
            o.set('strokeId', redonePath.strokeId);
          }
          canvas.add(o);
        });
        canvas.renderAll();
        console.log('Path restored using enlivenObjects fallback');
      });
    }
    
    // Broadcast redo event
    socketRef.current?.emit('drawing-update', {
      roomId,
      drawingData: { type: 'redo-one', path: redonePath },
      userId: currentUserId
    });
    
    ensureDrawingMode();
  };

  const handleExportPng = () => {
    if (isViewer) return;
    if (!fabricRef.current) return;
    const dataUrl = fabricRef.current.toDataURL({ format: 'png' });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'whiteboard.png';
    link.click();
  };

  const handleRunCode = async () => {
    if (isViewer) {
      alert('Viewers cannot run code.');
      return;
    }
    setRunLoading(true);
    setRunOutput('');
    setRunError('');
    setRunTime(null);
    try {
      const response = await axios.post('/execute', {
        code,
        language: currentFile?.language || 'javascript',
        roomId,
        fileId: currentFile?._id || null,
        filePath: currentFile?.path || currentFile?.name || null
      });
      setRunOutput(response.data.output || '');
      setRunError(response.data.error || '');
      setRunTime(response.data.executionTime || null);
    } catch (err) {
      setRunError(err.response?.data?.message || 'Failed to execute code');
    } finally {
      setRunLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="room-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="room-container">
        <div className="error-message">Room not found</div>
      </div>
    );
  }

  return (
    <div className="room-container">
      <header className="room-header">
        <div className="header-left">
          <h1>Room: {roomId}</h1>
          <p>{room.repository?.name}</p>
          {whoIsOnWhat.length > 0 && (
            <div className="muted" style={{ fontSize: '0.85rem' }}>
              {(() => {
                const max = 4;
                const shown = whoIsOnWhat.slice(0, max);
                const extra = whoIsOnWhat.length - shown.length;
                const parts = shown.map((e) => `${e.names.join(', ')} → ${e.filename}`);
                return (
                  <>
                    Working on: {parts.join(' · ')}
                    {extra > 0 ? ` · +${extra} more` : ''}
                  </>
                );
              })()}
            </div>
          )}
        </div>
        <div className="header-right">
          <button onClick={handleCopyInvite} className="btn btn-outline">
            Copy Room Link
          </button>
          <button onClick={handleDownloadZip} className="btn btn-outline">
            Download ZIP
          </button>
          <button onClick={leaveRoom} className="btn btn-secondary">
            Leave Room
          </button>
        </div>
      </header>

      <div className="room-content">
        <div className="file-tree-panel">
          <div className="file-tree-header">
            <h3>Files</h3>
            <button
              className="btn btn-outline"
              onClick={() => setShowCreateModal(true)}
              disabled={isViewer}
              title={isViewer ? 'Viewers cannot create files/folders' : 'Create file or folder'}
            >
              New
            </button>
            <button
              className="btn btn-outline"
              onClick={handleRefreshFiles}
              title="Refresh file tree"
            >
              Refresh
            </button>
          </div>
          <FileTree
            files={files}
            onFileSelect={handleFileSelect}
            onFileDelete={handleFileDelete}
            onRenameMove={openEditModal}
            currentFile={currentFile}
            canDelete={!isViewer}
          />
        </div>

        <div className="editor-section">
          <div className="collab-editor">
            <div className="editor-header">
              <div className="editor-header-left">
                <h4 style={{ margin: 0 }}>
                  {currentFile ? currentFile.name : 'Shared Editor'}
                </h4>
                {currentFile && (
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    Last edited by{' '}
                    <strong>{currentFile.lastModifiedBy?.username || 'Unknown'}</strong>{' '}
                    {currentFile.updatedAt ? `at ${new Date(currentFile.updatedAt).toLocaleString()}` : ''}
                    {contributorsByFile[currentFile._id]?.length ? (
                      <>
                        {' '}
                        · Contributors:{' '}
                        {contributorsByFile[currentFile._id].join(', ')}
                      </>
                    ) : null}
                    {activeUsersByFile[currentFile._id]?.length ? (
                      <>
                        {' '}
                        · Editing:{' '}
                        {activeUsersByFile[currentFile._id]
                          .map((u) => u.username || u.userId)
                          .join(', ')}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="editor-header-actions">
                <select
                  className="btn btn-outline"
                  value={editorTheme}
                  onChange={(e) => setEditorTheme(e.target.value)}
                >
                  <option value="vs-dark">Dark</option>
                  <option value="vs-light">Light</option>
                  <option value="vs">Classic</option>
                </select>

                <div className="copilot-menu">
                  <button
                    className="btn btn-outline"
                    onClick={() => setShowCopilotMenu((prev) => !prev)}
                  >
                    AI Copilot ▾
                  </button>
                  {showCopilotMenu && (
                    <div className="copilot-dropdown">
                      <button onClick={() => handleCopilotAction('Generate')}>Generate</button>
                      <button onClick={() => handleCopilotAction('Insert')}>Insert</button>
                      <button onClick={() => handleCopilotAction('Replace')}>Replace</button>
                      <button onClick={() => handleCopilotAction('Suggest')}>Suggest</button>
                    </div>
                  )}
                </div>

                <button className="btn btn-primary" onClick={handleRunCode} disabled={runLoading || isViewer}>
                  {runLoading ? 'Running...' : 'Run'}
                </button>
              </div>
            </div>
            <Editor
              height="50vh"
              language={currentFile?.language || 'javascript'}
              theme={editorTheme}
              value={code}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: true },
                fontSize: 15,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: isViewer
              }}
            />
            <div className="run-output">
              <div className="run-output-header">
                <span>Output</span>
                {runTime !== null && <small>Time: {runTime} ms</small>}
              </div>
              {runError ? (
                <pre className="error-result">{runError}</pre>
              ) : (
                <pre className="output-result">{runOutput || 'Run to see output'}</pre>
              )}
            </div>
          </div>

          <div className="whiteboard" ref={whiteboardContainerRef}>
            <div className="whiteboard-header">
              <h4>Collaborative Whiteboard</h4>
              <div className="whiteboard-actions">
                <label className="whiteboard-control">
                  <span>Brush</span>
                  <input type="color" value={brushColor} onChange={handleBrushColorChange} disabled={isViewer} />
                </label>
                <label className="whiteboard-control">
                  <span>Size</span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={brushSize}
                    onChange={handleBrushSizeChange}
                    style={{ width: '70px' }}
                    disabled={isViewer}
                  />
                </label>
                <button 
                  className="btn btn-outline" 
                  onClick={handleUndo}
                  disabled={!canUndo || isViewer}
                >
                  Undo
                </button>
                <button 
                  className="btn btn-outline" 
                  onClick={handleRedo}
                  disabled={!canRedo || isViewer}
                >
                  Redo
                </button>
                <button className="btn btn-outline" onClick={handleExportPng} disabled={isViewer}>Export PNG</button>
                <button className="btn btn-outline" onClick={clearWhiteboard} disabled={isViewer}>Clear</button>
              </div>
            </div>
            <canvas ref={canvasRef} />
          </div>
        </div>

        <div className="sidebar">
          <div className="participants-section">
            <h3>Participants</h3>
            <div className="participants-list">
              {participants.map((p) => {
                const uid = p.user?._id || p.user || 'unknown';
                const username = p.user?.username || p.username || 'User';
                const role = getParticipantRole(p);
                const online = onlineMap[uid] !== false; // default true
                const isSelf = currentUserId && String(uid) === String(currentUserId);
                const isOwnerLike = role === 'owner';
                return (
                  <div key={uid} className="participant-row">
                    <span className={`status-dot ${online ? 'online' : 'offline'}`} />
                    <span className="participant-name">{username}</span>
                    <span className={`role-badge role-${role}`}>{roleLabel(role)}</span>
                    {canManageParticipants && !isSelf && !isOwnerLike && (
                      <div className="participant-actions">
                        <select
                          className="btn btn-outline"
                          value={p.role || 'viewer'}
                          onChange={(e) => requestRoleChange(uid, e.target.value)}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button className="btn btn-secondary" onClick={() => requestKick(uid)}>
                          Kick
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {participants.length === 0 && <div className="muted">No participants</div>}
            </div>
          </div>

          <div className="activity-section">
            <h3>Activity</h3>
            <div className="activity-list">
              {activity.length === 0 ? (
                <div className="muted">No activity yet</div>
              ) : (
                activity.map((a, idx) => (
                  <div key={`${a.createdAt || idx}-${idx}`} className="activity-item">
                    <div className="activity-message">{a.message || a.type}</div>
                    <small className="activity-time">
                        {(a.createdAt ? new Date(a.createdAt).toLocaleTimeString() : '')}
                      </small>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="chat-section">
            <h3>Group Chat</h3>
            <div className="messages">
              {uniqueMessages.map((msg, index) => {
                  const username = msg.username || msg.sender?.username || 'User';
                  const content = msg.content || msg.message || '';
                  const image = msg.image || null;
                  const imageName = msg.imageName || null;
                  const messageType = msg.messageType || (image ? 'image' : 'text');
                  const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
                  
                  // Create a unique key for React
                  const msgKey = msg._id || 
                    `${msg.userId || msg.username}-${msg.timestamp}-${index}`;
                  
                  // Debug log for image messages
                  if (image || messageType === 'image') {
                    console.log('Rendering message with image:', {
                      index,
                      msgKey: msgKey.substring(0, 60),
                      hasImage: !!image,
                      imageLength: image?.length,
                      messageType,
                      imageName,
                      imagePreview: image ? image.substring(0, 50) : null
                    });
                  }
                  
                  return (
                    <div key={msgKey} className="message">
                    <strong>{username}:</strong>
                    {(messageType === 'image' || image) && image ? (
                      <div className="message-image-container">
                        <img 
                          src={image} 
                          alt={imageName || 'Shared image'} 
                          className="message-image"
                          onClick={() => {
                            setSelectedImage({ src: image, name: imageName, caption: content });
                            setIsImageModalOpen(true);
                          }}
                          style={{ cursor: 'pointer' }}
                          onError={(e) => {
                            console.error('Image failed to load:', e, image?.substring(0, 100));
                          }}
                          onLoad={() => {
                            console.log('Image loaded successfully');
                          }}
                        />
                        {imageName && <div className="image-name">{imageName}</div>}
                        {content && <div className="image-caption">{content}</div>}
                      </div>
                    ) : messageType === 'image' && !image ? (
                      <div className="message-error">Image not available</div>
                    ) : (
                      <span>{content}</span>
                    )}
                    {ts && <small>{ts}</small>}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {imagePreview && (
              <div className="image-preview-container">
                <img src={imagePreview} alt="Preview" className="image-preview" />
                <button onClick={removeImage} className="btn-remove-image">×</button>
              </div>
            )}
            <div className="message-input">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
              />
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                disabled={isViewer}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-outline"
                title="Send image"
                disabled={isViewer}
              >
                📷
              </button>
              <button 
                type="button"
                onClick={sendMessage} 
                className="btn btn-primary"
                disabled={isViewer || isSendingMessage || (!newMessage.trim() && !imageFile)}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CreateFileModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleFileCreate}
          files={files}
        />
      )}

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rename / Move</h3>
              <button onClick={() => setShowEditModal(false)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleRenameMove(); }}>
              <div className="modal-body">
            <div className="form-group">
                  <label htmlFor="editName">New Name</label>
              <input
                    id="editName"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter new file name"
                    required
              />
            </div>
            <div className="form-group">
                  <label htmlFor="editParent">Move to Folder</label>
              <select
                    id="editParent"
                value={editParent || ''}
                onChange={(e) => setEditParent(e.target.value)}
              >
                <option value="">(Root)</option>
                    {flattenFolders(files)
                      .filter((f) => f._id !== editTarget?._id) // Prevent moving into itself
                      .map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.path || f.name}
                  </option>
                ))}
              </select>
                </div>
            </div>
            <div className="modal-actions">
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="btn btn-primary" 
                  disabled={!editName.trim()}
                >
                Save
              </button>
            </div>
            </form>
          </div>
        </div>
      )}

      {showCopilotModal && (
        <CopilotModal
          action={copilotAction}
          language={currentFile?.language || 'javascript'}
          currentCode={code}
          onClose={() => setShowCopilotModal(false)}
          onApply={handleCopilotApply}
        />
      )}

      {/* Image Modal */}
      {isImageModalOpen && selectedImage && (
        <div className="image-modal-overlay" onClick={() => setIsImageModalOpen(false)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="image-modal-close" onClick={() => setIsImageModalOpen(false)}>
              ×
            </button>
            <img src={selectedImage.src} alt={selectedImage.name || 'Full size image'} className="image-modal-image" />
            {selectedImage.name && <div className="image-modal-name">{selectedImage.name}</div>}
            {selectedImage.caption && <div className="image-modal-caption">{selectedImage.caption}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Room;

