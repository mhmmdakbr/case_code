var mysql = require('mysql');

var con = mysql.createConnection({
  host: "127.0.0.1",
  port: "8889",
  user: "rizq",
  password: "summer",
  database: "poin"
});

con.connect(function (err){
    if(err) throw err;
});

module.exports = con;