"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const fileSchema = new mongoose_1.Schema({
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Repository',
        required: true
    },
    parentFolder: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastModifiedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User'
    }
});
// Update the updatedAt field before saving
fileSchema.pre('save', function () {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const doc = this;
    doc.updatedAt = new Date();
    if (doc.content) {
        doc.size = Buffer.byteLength(doc.content, 'utf8');
    }
});
// Index for efficient queries
fileSchema.index({ repository: 1, path: 1 });
fileSchema.index({ repository: 1, parentFolder: 1 });
exports.default = mongoose_1.default.model('File', fileSchema);
