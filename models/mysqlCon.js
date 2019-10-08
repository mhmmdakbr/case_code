var mysql = require('mysql');

//- Connection configuration
var con  = mysql.createPool({
  connectionLimit : 10,
  host: "35.198.205.215",
  port: "3306",
  user: "root",
  password: "muslimpocket2019!@#",
  database: "rekonsiliasi_dev",
  multipleStatements: true
});


module.exports = con;