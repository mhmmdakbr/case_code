const express = require('express');
var router = express.Router();
const mysqlCon = require('../models/mysqlCon');
const Excel = require('exceljs')
const fetch = require('node-fetch')
const { URLSearchParams } = require('url');
const jwt = require("jsonwebtoken")
const { checkToken } = require('../middleware')
var _ = require('lodash');
const moment = require('moment');
const json2csv = require('json2csv').parse
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

router.post('/upload/linkaja', upload.single('file'), (req, res) => {
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
router.get('/get/databyattachment/:attachment_id/:channel', (req, res) => {
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
    addParam(req, res)
});

//read or get data params
router.get('/get/params', (req, res) => {
    getParams(req, res)
});

//update
router.put('/update', (req, res) => {
    updateParam(req, res)
});

//delete
router.delete('/delete', (req, res) => {
    paramsRemove(req, res)
});

//exportcsv
router.get('/exportcsv/:bank/:date', (req, res) => {
    exportCSV(req, res)
});

//login
router.post('/login', (req, res) => {
    var userID = req.body.userID;
    var Password = req.body.password;

    if (!_.isEmpty(userID) && !_.isEmpty(Password)) {

        login(req, res)

    } else {
        res.send({ status: "error", desc: "user and password cant null" });
    }

});
/*************************************** Function List **********************************************/


function login(req, res) {
    const sql = `select * from users where email = '${req.body.userID}' and password = '${req.body.password}'`;

    let token;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
            res.send({ status: "error", desc: error })
        } else {
            if (!_.isEmpty(rows)) {
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

const getDataBank = (bank, date) => {
    return new Promise(resolve => {
        var sql = `SELECT no_rekening_penerima, nama_rekening_penerima, total_pembayaran 
        FROM transaction
        WHERE bank_penerima = '${bank}' AND tgl_transaksi = '${date}'`;
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
                                    console.log("Insert data import")
                                    //4.matching data between dataKonekthing and rows array hasil convert
                                    mysqlCon.query(`SET sql_mode = '';
                                    INSERT INTO transaction_import ( 
                                    channel , transaction_id , bill_no , reference_id , transaction_date , 
                                      payment_date , amount , payment_amount ,
                                      attachment_id , status, isSame
                                  ) values ( 
                                    '${row.values[4]}' , '${row.values[5]}' ,${parseInt(row.values[6])} , '${row.values[7]}' , CAST('${row.values[11]}' AS datetime) ,  
                                      CAST('${row.values[12]}' AS datetime) , ${parseInt(row.values[13])} , ${parseInt(row.values[14])} , 
                                      ${id_attachment} , '${row.values[15]}' , 0
                                  )`, async function (error, rows, fields) {
                                        if (error) {
                                            console.log(error)
                                        } else {
                                            for (var i = 0; i < dataKonekthing.length; i++) {
                                                if (parseInt(dataKonekthing[i].bill_no) === parseInt(row.values[6])) {
                                                    console.log('Insert data muslimpocket')
                                                    match_data.push(dataKonekthing[i])

                                                    //insert data muslimpocket yang sama
                                                    mysqlCon.query(`INSERT INTO transaction ( bill_reff, sender , receiver , channel ,   
                                                                                    transaction_id , tgl_transaksi ,total_pembayaran, tgl_pembayaran , total_amount ,
                                                                                    attachment_id , penerima ,  bank_penerima , no_rekening_penerima, status, total_potongan_immobi, nama_rekening_penerima, export_bank) values ( 
                                                                                    ${parseInt(dataKonekthing[i].bill_reff)}, '${dataKonekthing[i].username_pengirim_ovo}' , '${dataKonekthing[i].username_penerima_ovo}' , 'ovo' , '${dataKonekthing[i].trx_id}' , CAST('${dataKonekthing[i].bill_date}' AS datetime) , ${parseInt(dataKonekthing[i].payment_total)},
                                                                                    CAST('${dataKonekthing[i].payment_date}' AS datetime) , ${parseInt(dataKonekthing[i].bill_total)} , ${id_attachment} , 
                                                                                    "${dataKonekthing[i].masjid_nama}" , '${dataKonekthing[i].bank_nama}' , '${dataKonekthing[i].masjid_no_rekening}' , 
                                                                                    '${dataKonekthing[i].payment_status_desc}', ${parseInt(dataKonekthing[i].payment_total) * (parameters[0].nilai_parameter)} , 
                                                                                    "${dataKonekthing[i].masjid_pemilik_rekening}", "F"
                                                                                )`, async function (error, rows, fields) {
                                                        if (error) {
                                                            console.log(error)

                                                        } else {
                                                            console.log(rows, "update yang sama")
                                                            mysqlCon.query(`SET sql_mode = '';
                                                                            UPDATE transaction_import SET isSame = 1
                                                                            WHERE bill_no = ${row.values[6]}`,
                                                                async function (error, rows, fields) {
                                                                    if (error) {
                                                                        console.log(error)

                                                                    } else {
                                                                        console.log(rows)
                                                                    }
                                                                });

                                                        }

                                                    });

                                                    //insert data import yang sama

                                                    count++
                                                }
                                            }
                                        }
                                    });

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
    var dataKonekthing = await getDataKonekthing('linkaja');

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
                            sheet.eachRow(async (row, rowIndex) => {
                                console.log(row.values, rowIndex)
                                if (row.values.includes("IDR", 6)) {
                                    await console.log("Insert data import")

                                    //convert dd/mm/yyyy hh:mm:ss to yyyy-mm-dd hh:mm:ss
                                    var datetime1 = await row.values[3].split(" ")
                                    var date1 = datetime1[0].split("/").reverse().join("-")
                                    var newdatetime1 = date1.concat(" ", datetime1[1])

                                    var datetime2 = await row.values[2].split(" ")
                                    var date2 = datetime2[0].split("/").reverse().join("-")
                                    var newdatetime2 = date2.concat(" ", datetime2[1])
                                    //4.matching data between dataKonekthing and rows array hasil convert
                                    await mysqlCon.query(`SET sql_mode = '';
                                    INSERT INTO transaction_import ( 
                                    channel , transaction_id , bill_no , reference_id , transaction_date , 
                                      payment_date , amount , payment_amount ,
                                      attachment_id , status, isSame
                                  ) values ( 
                                    'LINKAJA' , '${row.values[1]}' ,0 , '${row.values[1]}' , CAST('${newdatetime1}' AS datetime) ,  
                                      CAST('${newdatetime2}' AS datetime) , ${parseInt(row.values[7])} , ${parseInt(row.values[7])} , 
                                      ${id_attachment} , '${row.values[5]}' , 0
                                  )`, async function (error, rows, fields) {
                                        if (error) {
                                            console.log(error)
                                        } else {
                                            for (var i = 0; i < dataKonekthing.length; i++) {
                                                var datetime3 = await row.values[2].split(" ")
                                                var date3 = datetime3[0].split("/").reverse().join("-")
                                                var newdatetime3 = date3.concat(" ", datetime3[1])
                                                if ((moment(`${dataKonekthing[i].transactionDate}`).format('YYYY-MM-DD HH:mm:ss') === moment(`${newdatetime3}`).format('YYYY-MM-DD HH:mm:ss')) && (parseInt(dataKonekthing[i].amount) === parseInt(row.values[7]))) {
                                                    await console.log('Insert data muslimpocket')
                                                    await match_data.push(dataKonekthing[i])
                                                    var datetime5 = await row.values[3].split(" ")
                                                    var date5 = datetime5[0].split("/").reverse().join("-")
                                                    var newdatetime5 = date5.concat(" ", datetime5[1])
                                                    //insert data muslimpocket yang sama
                                                    await mysqlCon.query(`INSERT INTO transaction ( bill_reff, sender , receiver , channel ,   
                                                                                    transaction_id , tgl_transaksi ,total_pembayaran, tgl_pembayaran , total_amount ,
                                                                                    attachment_id , penerima ,  bank_penerima , no_rekening_penerima, status, total_potongan_immobi, nama_rekening_penerima, export_bank) values ( 
                                                                                    ${parseInt(dataKonekthing[i].id_linkaja)}, '${dataKonekthing[i].username_pengirim_linkaja}' , '${dataKonekthing[i].username_penerima_linkaja}' , 'linkaja' , '${dataKonekthing[i].trxId}' , CAST('${newdatetime5}' AS datetime) , ${parseInt(dataKonekthing[i].amount)},
                                                                                    CAST('${dataKonekthing[i].transactionDate}' AS datetime) , ${parseInt(dataKonekthing[i].amount)} , ${id_attachment} , 
                                                                                    "${dataKonekthing[i].masjid_nama}" , '${dataKonekthing[i].bank_nama}' , '${dataKonekthing[i].masjid_no_rekening}' , 
                                                                                    '${dataKonekthing[i].status}', ${parseInt(dataKonekthing[i].amount) * (parameters[0].nilai_parameter)} , 
                                                                                    "${dataKonekthing[i].masjid_pemilik_rekening}", "F"
                                                                                )`, async function (error, rows, fields) {
                                                        if (error) {
                                                            console.log(error)

                                                        } else {
                                                            await console.log(rows, "update yang sama")
                                                            var datetime4 = await row.values[2].split(" ")
                                                            var date4 = datetime4[0].split("/").reverse().join("-")
                                                            var newdatetime4 = date4.concat(" ", datetime4[1])
                                                            await mysqlCon.query(`SET sql_mode = '';
                                                                            UPDATE transaction_import SET isSame = 1
                                                                            WHERE payment_date = CAST('${newdatetime4}' AS datetime) AND payment_amount = '${parseInt(row.values[7])}' `,
                                                                async function (error, rows, fields) {
                                                                    if (error) {
                                                                        console.log(error)

                                                                    } else {
                                                                        console.log(rows)
                                                                    }
                                                                });

                                                        }

                                                    });

                                                    //insert data import yang sama

                                                    await count++
                                                }
                                            }
                                        }
                                    });

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

const getDataMPByAttachmentID = (id, channel) => {
    return new Promise(resolve => {
        if(channel === "ovo"){
            var sql = `SELECT  * from transaction tr
            WHERE tr.attachment_id = '${id}'
            ORDER BY tr.bill_reff ASC `;
        }else if(channel === "linkaja"){
            var sql = `SELECT  * from transaction tr
            WHERE tr.attachment_id = '${id}'
            ORDER BY tr.tgl_pembayaran ASC `;
        }else{
            var sql = `SELECT  * from transaction tr
            WHERE tr.attachment_id = '${id}' `;
        }
       
        console.log(sql)
        mysqlCon.query(sql,
            function (error, rows, fields) {
                if (error) {
                    console.log(error)
                } else {
                    resolve(rows);
                }
            });
    });
}

const getDataImportByAttachmentID = (id,channel) => {
    return new Promise(resolve => {
        if(channel === "ovo"){
            var sql =  `SELECT  * from transaction_import tr
            WHERE tr.attachment_id = '${id}'
            ORDER BY tr.bill_no ASC `;
        }else if(channel === "linkaja"){
            var sql = `SELECT  * from transaction_import tr
            WHERE tr.attachment_id = '${id}'
            ORDER BY tr.payment_date ASC `;
        }else{
            var sql = `SELECT  * from transaction_import tr
            WHERE tr.attachment_id = '${id}' `;
        }
       ;
        console.log(sql)
        mysqlCon.query(sql,
            function (error, rows, fields) {
                if (error) {
                    console.log(error)
                } else {
                    resolve(rows);
                }
            });
    });
}

const getNominalDataImport = id => {
    return new Promise(resolve => {
        var sql = `SELECT IFNULL(COUNT(id),0) as jumlah_transaksi, IFNULL(SUM(tr.payment_amount),0) as amount from transaction_import tr
        WHERE tr.attachment_id = '${id}' `;
        console.log(sql)
        mysqlCon.query(sql,
            function (error, rows, fields) {
                if (error) {
                    console.log(error)
                } else {
                    resolve(rows[0]);
                }
            });
    });
}

const getNominalDataMP = id => {
    return new Promise(resolve => {
        var sql = `SELECT IFNULL(COUNT(id),0) as jumlah_transaksi, IFNULL(SUM(tr.total_pembayaran),0) as amount from transaction tr
        WHERE tr.attachment_id = '${id}' `;
        console.log(sql)
        mysqlCon.query(sql,
            function (error, rows, fields) {
                if (error) {
                    console.log(error)
                } else {
                    resolve(rows[0]);
                }
            });
    });
}

async function getAllDataByAttachment(req, res) {

    const dataMP = await getDataMPByAttachmentID(req.params.attachment_id,req.params.channel)
    const dataImport = await getDataImportByAttachmentID(req.params.attachment_id,req.params.channel)
    const nominalImport = await getNominalDataImport(req.params.attachment_id)
    const nominalMP = await getNominalDataMP(req.params.attachment_id)

    if (dataMP && dataImport && nominalImport && nominalMP) {
        res.send({ data_MP: dataMP, data_Import: dataImport, nominal_Import: nominalImport, nominal_MP: nominalMP })
    }
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

async function exportCSV(req, res) {
    var dataByBank = await getDataBank(req.params.bank, req.params.date);
    var dateNow = moment().format('L')
    if (dataByBank) {
        const csvfix = json2csv(dataByBank)
        res.attachment(`${dateNow}_transaksi${req.params.bank}.csv`);
        res.status(200).send(csvfix);
    } else {
        res.send("data tidak ada")
    }
}

function addParam(req, res) {

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