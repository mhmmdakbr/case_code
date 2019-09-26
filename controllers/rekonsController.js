const express = require('express');
var router = express.Router();
const mysqlCon = require('../models/mysqlCon');
const Excel = require('exceljs')
const fetch = require('node-fetch')
const { URLSearchParams } = require('url');
let jwt = require('jsonwebtoken');
var _ = require('lodash');
let config = require('../config');


/// ini untuk upload ///
const multer = require('multer');
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './tmp/csv');
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
var upload = multer({ storage: storage })
///                 ///



//upload and convert csv & xlxs
router.post('/upload/ovo', upload.single('file'), (req, res) => {
    convertCsvOVO(req, res)
});

router.post('/upload/link aja', upload.single('file'), (req, res) => {
    convertCsvLinkAja(req, res)
});
    
router.post('/upload/gopay', upload.single('file'), (req, res) => {
    convertCsvGoPay(req, res)
});

//show data summary sesuai semua data yg pertama dimunculkan
router.get('/get/datasummary/', (req, res) => {
    getDataSummary(req, res)
});

//show data semua sesuai attachment yg dipilih
router.get('/get/databyattachment/:attachment_id', (req, res) => {
    getAllDataByAttachment(req, res)
});

router.get('/get/allattachment/:channel', (req, res) => {
    getAllAttachment(req, res)
});

router.get('/get/alldata', (req, res) => {
    getAllData(req, res)
});

// add params
router.post('/add', (req, res) => {
    addParam(req,res)
});

//read or get data params
router.get('/get/params', (req, res) => {
    getParams(req, res)
});

//update
router.put('/update', (req, res) => {
    updateParam(req,res)
});

//delete
router.delete('/delete', (req,res) => {
    paramsRemove(req,res)
});

//exportcsv
router.delete('/exportcsv', (req,res) => {
    paramsRemove(req,res)
});

//login
router.post('/login', (req, res) => {
    var userID = req.body.userID;
    var Password = req.body.password;

    if (!_.isEmpty(userID) && !_.isEmpty(Password)) {

        login(req, res)

    } else {
        res.send({status : "error", desc: "user and password cant null"});
    }

});
/*************************************** Function List **********************************************/


function login(req, res) {
    const sql = `select * from users where email = '${req.body.userID}' and password = '${req.body.password}'`;

    let token;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
            res.send({status : "error", desc: error})
        } else {
            if(!_.isEmpty(rows)) {
                token = giveToken(req.body.email)
            } else {
                rows = '';
            }
            res.send({ userProfile: rows, token: token })
        }
    });
}

function giveToken(userID) {

    let token = jwt.sign({ username: userID },
        config.secret,
        {
            expiresIn: '24h'
        }
    );

    return token;

}

const getDataKonekthing = type => {
    return new Promise(resolve => {
        //1. get data dari api konekthing
        const url = 'https://muslimpocket.com/cms/Pembayaran/by_jenis';
        // The data we are going to send in our request

        const params = new URLSearchParams();
        params.append('jenis_payment', type)
        // The parameters we are gonna pass to the fetch function
        let fetchData = {
            method: 'POST',
            body: params,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'key': 'TANYAKYAI'
            }
        }
        fetch(url, fetchData)
            .then(response => response.json())
            .then(data => { if (data) { resolve(dataKonekthing = data.result) } })

    });
}

const getDataBank = (bank,date) => {
    return new Promise(resolve => {
        var sql = `SELECT no_rekening_penerima, nama_rekening_penerima, total_pembayaran 
        FROM transaction
        WHERE bank_penerima = '${bank}' AND tgl_transaksi = '2019-08-09 18:04:41.000000' AND status LIKE '%sukses%'`;
        console.log(sql)
        mysqlCon.query(sql,
            function (error, rows, fields) {
                if (error) {
                    console.log(error)
                } else {
                    // console.log(rows[0])
                    resolve(rows);
                }
            });
    });
}

const getParameter = async channel => {
    return new Promise(resolve => {
        var sql = `SELECT * FROM parameter WHERE channel = '${channel}'`;
        console.log(sql)
        mysqlCon.query(sql,
            function (error, rows, fields) {
                if (error) {
                    console.log(error)
                } else {
                    // console.log(rows[0])
                    resolve(rows);
                }
            });
    });
}

async function convertCsvOVO(req, res) {

    //1.fetching data dari dataKonekthing
    var dataKonekthing = await getDataKonekthing('ovo');

    //get parameter for shared fee
    var parameters = await getParameter('ovo');

    var id_attachment = 0

    //2.insert to db table attachment, channel disesuain 
    await mysqlCon.query(`
                        INSERT INTO attachment ( 
                            attachment_name , import_at , ext_name , channel
                          ) values ( 
                            '${req.file.filename}' , NOW() , '${req.file.mimetype}', 'ovo'
                          )`, async function (error, rows, fields) {
            if (error) {
                res.send({ status: 'failed', desc: error })
            } else {
                id_attachment = rows.insertId
                var count = 0;
                var match_data = []
                var workbook = new Excel.Workbook()
                console.log("type : ", req.file.mimetype)
                if (req.file.mimetype.includes("spreadsheet")) {
                    //3.proses perubahan xlsx menjadi array
                    await workbook.xlsx.readFile(req.file.path)
                        .then(workbook => {
                            workbook.eachSheet((sheet, id) => {
                                sheet.eachRow((row, rowIndex) => {
                                    console.log(row.values, rowIndex)
                                    if (row.values.includes("OVO", 4)) {
                                        //4.matching data between dataKonekthing and rows array hasil convert
                                        for (var i = 0; i < dataKonekthing.length; i++) {
                                            if (parseInt(dataKonekthing[i].bill_no) === parseInt(row.values[6])) {
                                                console.log('jalan')
                                                match_data.push(dataKonekthing[i])
                                                mysqlCon.query(`SET sql_mode = '';INSERT INTO transaction ( merchant_id , merchant_name , channel ,   
                                                    transaction_id , tgl_transaksi ,total_pembayaran, tgl_pembayaran , total_amount ,
                                                    attachment_id , penerima ,  bank_penerima , no_rekening_penerima, status, total_potongan_immobi, bill_reff, nama_rekening_penerima) values ( 
                                                    ${row.values[2]} , '${row.values[3]}' , 'ovo' , '${dataKonekthing[i].trx_id}' , CAST('${dataKonekthing[i].bill_date}' AS date) , ${parseInt(dataKonekthing[i].payment_total)},
                                                    CAST('${dataKonekthing[i].payment_date}' AS date) , ${parseInt(dataKonekthing[i].bill_total)} , ${id_attachment} , 
                                                    "${dataKonekthing[i].masjid_nama}" , '${dataKonekthing[i].bank_nama}' , '${dataKonekthing[i].masjid_no_rekening}' , 
                                                    '${dataKonekthing[i].payment_status_desc}', ${parseInt(dataKonekthing[i].payment_total) * (parameters[0].nilai_parameter)} , 
                                                    ${parseInt(dataKonekthing[i].bill_reff)}, "${dataKonekthing[i].masjid_pemilik_rekening}"
                                                )`, async function (error, rows, fields) {
                                                        if (error) {
                                                            console.log(error)
                                                            res.send({ status: 'failed', desc: error })
                                                        }

                                                    });
                                                count++
                                            }
                                        }
                                    }

                                })
                            })

                        })
                    if (count < 1) {
                        console.log(count)
                        res.send({ status: 'success', desc: 'tidak ada data yang masuk' })
                    } else {
                        console.log(count)
                        res.send({ status: 'success', desc: `${count} data match`, match_data })
                    }


                } else if (req.file.mimetype.includes("csv")) {
                    await workbook.csv.readFile(req.file.path)
                        .then(worksheet => {
                            worksheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
                                console.log("Row " + rowNumber + " = " + row.values)
                                if (row.values.includes("OVO", 4)) {
                                    mysqlCon.query(`
            INSERT INTO transaksi ( 
            merchant_id , merchant_name , channel ,   
            transaction_id , reference_id , tgl_transaksi , 
              tgl_pembayaran , amount , total_amount ,
              attachment_id , customer_email ,  customer_name ,
              status
          ) values ( 
              ${row.values[2]} , '${row.values[3]}' , '${row.values[4]}' , 
              ${row.values[5]} , ${row.values[6]} , '${row.values[11]}',  
              '${row.values[12]}' , ${row.values[13]} , ${row.values[14]} , 
              ${id_attachment} , '${row.values[9]}' , '${row.values[8]}' , 
              '${row.values[15]}' 
          )`, async function (error, rows, fields) {
                                            if (error) {
                                                console.log(error)
                                                res.status(400).send('Oops, something happens')
                                            } else {
                                                count++
                                            }
                                        });
                                    count++
                                }
                            });
                            res.send(`data : ${count}`)
                        });


                } else {
                    res.send("file bukan csv atau xlsx")
                }
            }
        });
}

async function convertCsvLinkAja(req, res) {

    //1.fetching data dari dataKonekthing
    var dataKonekthing = await getDataKonekthing();

    //get parameter for shared fee
    var parameters = await getParameter('linkaja');

    var id_attachment = 0

    //2.insert to db table attachment, channel disesuain 
    await mysqlCon.query(`
                        INSERT INTO attachment ( 
                            attachment_name , import_at , ext_name , channel
                          ) values ( 
                            '${req.file.filename}' , NOW() , '${req.file.mimetype}', 'linkaja'
                          )`, async function (error, rows, fields) {
            if (error) {
                res.send({ status: 'failed', desc: error })
            } else {
                id_attachment = rows.insertId
                var count = 0;
                var match_data = []
                var workbook = new Excel.Workbook()
                console.log("type : ", req.file.mimetype)
                if (req.file.mimetype.includes("spreadsheet")) {
                    //3.proses perubahan xlsx menjadi array
                    await workbook.xlsx.readFile(req.file.path)
                        .then(workbook => {
                            workbook.eachSheet((sheet, id) => {
                                sheet.eachRow((row, rowIndex) => {
                                    console.log(row.values, rowIndex)
                                    if (row.values.includes("LinkAja", 4)) {
                                        //4.matching data between dataKonekthing and rows array hasil convert
                                        for (var i = 0; i < dataKonekthing.length; i++) {
                                            if (parseInt(dataKonekthing[i].trxId) === parseInt(row.values[6])) {
                                                console.log('jalan')    
                                                match_data.push(dataKonekthing[i])
                                                mysqlCon.query(`SET sql_mode = '';INSERT INTO transaction ( merchant_id , merchant_name , channel ,   
                                                    transaction_id , tgl_transaksi ,total_pembayaran, tgl_pembayaran , total_amount ,
                                                    attachment_id , penerima ,  bank_penerima , no_rekening_penerima, status, total_potongan_immobi, bill_reff, nama_rekening_penerima) values ( 
                                                    ${row.values[2]} , '${row.values[3]}' , 'linkaja' , '${dataKonekthing[i].trxId}' , CAST('${dataKonekthing[i].transactionDate}' AS datetime) , ${parseInt(dataKonekthing[i].amount)},
                                                    CAST('${dataKonekthing[i].transactionDate}' AS datetime) , ${parseInt(dataKonekthing[i].amount)} , ${id_attachment} , 
                                                    "${dataKonekthing[i].masjid_nama}" , '${dataKonekthing[i].bank_nama}' , '${dataKonekthing[i].masjid_no_rekening}' , 
                                                    '${dataKonekthing[i].status}', ${parseInt(dataKonekthing[i].amount) * (parameters[0].nilai_parameter)} , 
                                                    ${parseInt(dataKonekthing[i].refNum)}, "${dataKonekthing[i].masjid_pemilik_rekening}"
                                                )`, async function (error, rows, fields) {
                                                        if (error) {
                                                            console.log(error)
                                                            res.send({ status: 'failed', desc: error })
                                                        }

                                                    });
                                                count++
                                            }
                                        }
                                    }

                                })
                            })

                        })
                    if (count < 1) {
                        console.log(count)
                        res.send({ status: 'success', desc: 'tidak ada data yang masuk' })
                    } else {
                        console.log(count)
                        res.send({ status: 'success', desc: `${count} data match`, match_data })
                    }


                } else if (req.file.mimetype.includes("csv")) {
                    await workbook.csv.readFile(req.file.path)
                        .then(worksheet => {
                            worksheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
                                console.log("Row " + rowNumber + " = " + row.values)
                                if (row.values.includes("LinkAja", 4)) {
                                    mysqlCon.query(`
            INSERT INTO transaksi ( 
            merchant_id , merchant_name , channel ,   
            transaction_id , reference_id , tgl_transaksi , 
              tgl_pembayaran , amount , total_amount ,
              attachment_id , customer_email ,  customer_name ,
              status
          ) values ( 
              ${row.values[2]} , '${row.values[3]}' , '${row.values[4]}' , 
              ${row.values[5]} , ${row.values[6]} , '${row.values[11]}',  
              '${row.values[12]}' , ${row.values[13]} , ${row.values[14]} , 
              ${id_attachment} , '${row.values[9]}' , '${row.values[8]}' , 
              '${row.values[15]}' 
          )`, async function (error, rows, fields) {
                                            if (error) {
                                                console.log(error)
                                                res.status(400).send('Oops, something happens')
                                            } else {
                                                count++
                                            }
                                        });
                                    count++
                                }
                            });
                            res.send(`data : ${count}`)
                        });


                } else {
                    res.send("file bukan csv atau xlsx")
                }
            }
        });
}

async function convertCsvGoPay(req, res) {

    //1.fetching data dari dataKonekthing
    var dataKonekthing = await getDataKonekthing('gopay');

    //get parameter for shared fee
    var parameters = await getParameter('gopay');

    var id_attachment = 0

    //2.insert to db table attachment, channel disesuain 
    await mysqlCon.query(`
                        INSERT INTO attachment ( 
                            attachment_name , import_at , ext_name , channel
                          ) values ( 
                            '${req.file.filename}' , NOW() , '${req.file.mimetype}', 'gopay'
                          )`, async function (error, rows, fields) {
            if (error) {
                res.send({ status: 'failed', desc: error })
            } else {
                id_attachment = rows.insertId
                var count = 0;
                var match_data = []
                var workbook = new Excel.Workbook()
                console.log("type : ", req.file.mimetype)
                if (req.file.mimetype.includes("spreadsheet")) {
                    //3.proses perubahan xlsx menjadi array
                    await workbook.xlsx.readFile(req.file.path)
                        .then(workbook => {
                            workbook.eachSheet((sheet, id) => {
                                sheet.eachRow((row, rowIndex) => {
                                    console.log(row.values, rowIndex)
                                    if (row.values.includes("GOPAY", 4)) {
                                        //4.matching data between dataKonekthing and rows array hasil convert
                                        for (var i = 0; i < dataKonekthing.length; i++) {
                                            if (parseInt(dataKonekthing[i].bill_no) === parseInt(row.values[6])) {
                                                console.log('jalan')
                                                match_data.push(dataKonekthing[i])
                                                mysqlCon.query(`SET sql_mode = '';INSERT INTO transaction ( merchant_id , merchant_name , channel ,   
                                                    transaction_id , tgl_transaksi ,total_pembayaran, tgl_pembayaran , total_amount ,
                                                    attachment_id , penerima ,  bank_penerima , no_rekening_penerima, status, total_potongan_immobi, bill_reff, nama_rekening_penerima) values ( 
                                                    ${row.values[2]} , '${row.values[3]}' , 'gopay' , '${dataKonekthing[i].transaction_id}' , CAST('${dataKonekthing[i].transaction_time}' AS datetime) , ${parseInt(dataKonekthing[i].gross_amount)},
                                                    CAST('${dataKonekthing[i].transaction_time}' AS datetime) , ${parseInt(dataKonekthing[i].gross_amount)} , ${id_attachment} , 
                                                    "${dataKonekthing[i].masjid_nama}" , '${dataKonekthing[i].bank_nama}' , '${dataKonekthing[i].masjid_no_rekening}' , 
                                                    '${dataKonekthing[i].payment_status_desc}', ${parseInt(dataKonekthing[i].payment_total) * (parameters[0].nilai_parameter)} , 
                                                    ${parseInt(dataKonekthing[i].id_gopay)}, "${dataKonekthing[i].masjid_pemilik_rekening}"
                                                )`, async function (error, rows, fields) {
                                                        if (error) {
                                                            console.log(error)
                                                            res.send({ status: 'failed', desc: error })
                                                        }

                                                    });
                                                count++
                                            }
                                        }
                                    }

                                })
                            })

                        })
                    if (count < 1) {
                        console.log(count)
                        res.send({ status: 'success', desc: 'tidak ada data yang masuk' })
                    } else {
                        console.log(count)
                        res.send({ status: 'success', desc: `${count} data match`, match_data })
                    }


                } else if (req.file.mimetype.includes("csv")) {
                    await workbook.csv.readFile(req.file.path)
                        .then(worksheet => {
                            worksheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
                                console.log("Row " + rowNumber + " = " + row.values)
                                if (row.values.includes("OVO", 4)) {
                                    mysqlCon.query(`
            INSERT INTO transaksi ( 
            merchant_id , merchant_name , channel ,   
            transaction_id , reference_id , tgl_transaksi , 
              tgl_pembayaran , amount , total_amount ,
              attachment_id , customer_email ,  customer_name ,
              status
          ) values ( 
              ${row.values[2]} , '${row.values[3]}' , '${row.values[4]}' , 
              ${row.values[5]} , ${row.values[6]} , '${row.values[11]}',  
              '${row.values[12]}' , ${row.values[13]} , ${row.values[14]} , 
              ${id_attachment} , '${row.values[9]}' , '${row.values[8]}' , 
              '${row.values[15]}' 
          )`, async function (error, rows, fields) {
                                            if (error) {
                                                console.log(error)
                                                res.status(400).send('Oops, something happens')
                                            } else {
                                                count++
                                            }
                                        });
                                    count++
                                }
                            });
                            res.send(`data : ${count}`)
                        });


                } else {
                    res.send("file bukan csv atau xlsx")
                }
            }
        });
}

function getAllAttachment(req, res) {

    var sql = `SELECT  * from attachment WHERE channel = '${req.params.channel}'`;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });
}

function getAllDataByAttachment(req, res) {

    var sql = `SELECT  * from transaction tr
    WHERE tr.attachment_id = '${req.params.attachment_id}'`;
    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });
}

function getAllData(req, res) {

    var sql = `SELECT  tr.nama_rekening_penerima, tr.bank_penerima, tr.no_rekening_penerima, tr.total_pembayaran 
    FROM transaction tr
    WHERE tr.status LIKE '%Sukses%' `;
    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });
}

function getDataSummary(req, res) {
    const sql = `SELECT DATE_FORMAT(tr.tgl_transaksi, "%Y-%m-%d") as tgl_transaksi, tr.bank_penerima, count(tr.bank_penerima) as jumlah_transaksi, SUM(tr.total_amount) as nominal_transaksi
    FROM transaction tr
    GROUP BY tr.tgl_transaksi, tr.bank_penerima
    ORDER BY tr.tgl_transaksi`;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });

}

function addParam(req,res) {

    var sql = `INSERT INTO parameter (nama_parameter, nilai_parameter, channel)
                VALUES('${req.body.nama_parameter}','${req.body.nilai_parameter}','${req.body.channel}')`

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            res.send({ status: "error", desc: error })
        } else {
            res.send({ status: "success", desc: "Success" })
        }
    });
}

function updateParam(req, res) {
    const sql = `UPDATE parameter 
                            SET
                            nama_parameter = '${req.body.nama_parameter}' , 
                            nilai_parameter = '${req.body.nilai_parameter}' , 
                            channel = '${req.body.channel}' 
	                                WHERE
                                    id_parameter = '${req.body.id_parameter}' `;
    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            res.send({ status: "error", desc: error })
        } else {
            res.send({ status: "success", desc: "Success update" })
        }
    });
}

function paramsRemove(req, res) {
    const sql = `delete from parameter
	                                WHERE
                                    id_parameter = '${req.body.id_parameter}' `;
    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            res.send({ status: "error", desc: error })
        } else {
            res.send({ status: "success", desc: "Success delete" })
        }
    });
}

function getParams(req, res) {

    var sql = `SELECT  * from parameter `;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });
}

module.exports = router;