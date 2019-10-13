var mysql = require('mysql');

//- Connection configuration
var con  = mysql.createPool({
  connectionLimit : 10,
  host: "127.0.0.1",
  port: "3306",
  user: "root",
  password: "",
  database: "your_db_name",
  multipleStatements: true
});


module.exports = con;