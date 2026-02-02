"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setIO = setIO;
exports.getIO = getIO;
let ioInstance = null;
function setIO(io) {
    ioInstance = io;
}
function getIO() {
    return ioInstance;
}
