import mongoose, { Schema, Types } from 'mongoose';

export interface File {
  name: string;
  path: string;
  content: string;
  language: string;
  repository: Types.ObjectId;
  parentFolder: Types.ObjectId | null;
  isFolder: boolean;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: Types.ObjectId;
  lastModifiedBy?: Types.ObjectId;
}

const fileSchema = new Schema<File>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  path: {
    type: String,
    required: true
  },
  content: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'javascript'
  },
  repository: {
    type: Schema.Types.ObjectId,
    ref: 'Repository',
    required: true
  },
  parentFolder: {
    type: Schema.Types.ObjectId,
    ref: 'File',
    default: null
  },
  isFolder: {
    type: Boolean,
    default: false
  },
  size: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Update the updatedAt field before saving
fileSchema.pre('save', function () {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const doc: any = this;
  doc.updatedAt = new Date();
  if (doc.content) {
    doc.size = Buffer.byteLength(doc.content, 'utf8');
  }
});

// Index for efficient queries
fileSchema.index({ repository: 1, path: 1 });
fileSchema.index({ repository: 1, parentFolder: 1 });

export default mongoose.model<File>('File', fileSchema);



