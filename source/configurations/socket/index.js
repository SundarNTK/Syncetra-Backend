let ioInstance = null;

const initSocket = (io) => {
  ioInstance = io;

  io.on("connection", (socket) => {
    const userId = socket.handshake.auth?.userId;
    const role = socket.handshake.auth?.role;

    if (userId) {
      socket.join(`user:${userId}`);
    }
    if (role === "admin") {
      socket.join("admins");
    }

    socket.on("join-group", (groupId) => {
      if (groupId) socket.join(`group:${groupId}`);
    });

    socket.on("disconnect", () => {});
  });
};

const getIO = () => ioInstance;

const emitToGroup = (groupId, event, data) => {
  if (ioInstance) {
    ioInstance.to(`group:${groupId}`).emit(event, data);
  }
};

const emitToUser = (userId, event, data) => {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, data);
  }
};

const emitToAdmins = (event, data) => {
  if (ioInstance) {
    ioInstance.to("admins").emit(event, data);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitToGroup,
  emitToUser,
  emitToAdmins,
};
