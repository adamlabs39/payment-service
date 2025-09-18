// let clients = [];

// export function sendSseEvent(data) {
//   const message = `data: ${JSON.stringify(data)}\n\n`;
//   clients.forEach((client) => client.res.write(message));
// }

// export function sseHandler(req, res) {
//   res.setHeader('Content-Type', 'text/event-stream');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');
//   res.flushHeaders();

//   const clientId = Date.now();
//   const newClient = {
//     id: clientId,
//     res: res,
//   };
//   clients.push(newClient);
//   console.log(`SSE Client ${clientId} terhubung.`);

//   req.on('close', () => {
//     console.log(`SSE Client ${clientId} terputus.`);
//     clients = clients.filter((client) => client.id !== clientId);
//   });
// }
