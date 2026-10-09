// Test-only guard: fail even when application code catches a denied network call.
import net from 'node:net';
import dgram from 'node:dgram';

const deny = () => {
  console.error('CGROUND_TEST_NETWORK_DENIED');
  throw new Error('Network access is forbidden in this synthetic test.');
};
net.Socket.prototype.connect = deny;
net.Server.prototype.listen = deny;
dgram.Socket.prototype.send = deny;
dgram.Socket.prototype.bind = deny;
globalThis.fetch = deny;
