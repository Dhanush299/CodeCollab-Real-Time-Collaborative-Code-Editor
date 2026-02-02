import mongoose, { Schema, Types } from 'mongoose';

export interface FileRevision {
  file: Types.ObjectId;
  repository: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  content: string;
  contentHash: string;
  language?: string;
  name?: string;
  path?: string;
}

const fileRevisionSchema = new Schema<FileRevision>({
  file: {
    type: Schema.Types.ObjectId,
    ref: 'File',
    required: true
  },
  repository: {
    type: Schema.Types.ObjectId,
    ref: 'Repository',
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Snapshot content (simple, reliable; can later be replaced with diffs)
  content: {
    type: String,
    required: true
  },
  contentHash: {
    type: String,
    required: true
  },
  // Optional metadata
  language: {
    type: String
  },
  name: {
    type: String
  },
  path: {
    type: String
  }
});

fileRevisionSchema.index({ file: 1, createdAt: -1 });
fileRevisionSchema.index({ repository: 1, createdAt: -1 });
fileRevisionSchema.index({ contentHash: 1 });

export default mongoose.model<FileRevision>('FileRevision', fileRevisionSchema);



