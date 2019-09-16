var mysql = require('mysql');

var con = mysql.createPool({
  connectionLimit : 10,
  host: "35.185.184.68",
  port: "3306",
  user: "root",
  password: "muslimpocket2019!@#",
  database: "poin",
  multipleStatements: true
});

module.exports = con;