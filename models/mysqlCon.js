var mysql = require('mysql');

var con = mysql.createConnection({
  host: "35.247.172.123",
  port: "3306",
  user: "root",
  password: "Immsp4102",
  database: "rekonsil",
  multipleStatements: true
});

con.connect(function (err){
    if(err) throw err;
})


module.exports = con;