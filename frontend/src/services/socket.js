import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const connectSocket = () => {
  return io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
  });
};
