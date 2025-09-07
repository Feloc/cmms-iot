const mqtt = require('mqtt');
const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
const client = mqtt.connect(url);
client.on('connect', () => {
  console.log('MQTT demo publisher connected');
  const topic = 'cmms/' + (process.env.DEMO_TENANT || 'acme') + '/pump-001/temp';
  let v = 70;
  setInterval(() => {
    v += (Math.random() * 10 - 3);
    const msg = { ts: new Date().toISOString(), value: Number(v.toFixed(2)) };
    client.publish(topic, JSON.stringify(msg));
    console.log('published', topic, msg);
  }, 2000);
});
