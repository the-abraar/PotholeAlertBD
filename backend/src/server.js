'use strict';

require('dotenv').config();
const { assertProductionConfig } = require('./security');
assertProductionConfig();

const app = require('./app');
const { purgeContacts } = require('./retention');
const PORT = process.env.PORT || 4000;

purgeContacts();
setInterval(purgeContacts, 86_400_000).unref();
app.listen(PORT, () => {
  console.log(`PotholeAlertBD backend: http://localhost:${PORT}`);
});
