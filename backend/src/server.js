'use strict';

require('dotenv').config();
const { assertProductionConfig } = require('./security');
assertProductionConfig();

const app = require('./app');
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`PotholeAlertBD backend: http://localhost:${PORT}`);
});
