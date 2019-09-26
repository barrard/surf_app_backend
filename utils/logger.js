/* eslint-disable no-unused-vars */
const colors = require('colors')
const logger = require('tracer').colorConsole({
  format:
    '{{timestamp.green}} <{{title.yellow}}> {{message.cyan}} (in {{file.red}}:{{line}})',
  dateformat: 'HH:MM:ss.L'
})
module.exports = logger.log
