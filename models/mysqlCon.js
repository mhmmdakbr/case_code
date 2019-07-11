var mysql = require('mysql');

var con = mysql.createConnection({
  host: "127.0.0.1",
  port: "3306",
  user: "root",
  password: "muslimpocket2019!@#",
  database: "poin"
});

con.connect(function (err){
    if(err) throw err;
});

module.exports = con;