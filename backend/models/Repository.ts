import mongoose, { Schema, Types } from 'mongoose';

export type RepositoryRole = 'viewer' | 'editor' | 'admin';

export interface RepositoryCollaborator {
  user: Types.ObjectId;
  role: RepositoryRole;
  addedAt: Date;
}

export interface Repository {
  name: string;
  description?: string;
  owner: Types.ObjectId;
  collaborators: RepositoryCollaborator[];
  isPublic: boolean;
  language: string;
  createdAt: Date;
  updatedAt: Date;
  lastOpened?: Date;
}

const repositorySchema = new Schema<Repository>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collaborators: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      role: {
        type: String,
        enum: ['viewer', 'editor', 'admin'],
        default: 'viewer'
      },
      addedAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  isPublic: {
    type: Boolean,
    default: false
  },
  language: {
    type: String,
    default: 'javascript'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastOpened: {
    type: Date
  }
});

// Update the updatedAt field before saving
repositorySchema.pre('save', function () {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const doc: any = this;
  doc.updatedAt = new Date();
});

export default mongoose.model<Repository>('Repository', repositorySchema);



