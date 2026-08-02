import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(typeof window !== "undefined" ? window.location.origin : "http://localhost:3000", {
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
};
