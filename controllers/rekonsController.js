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
router.get('/get/rekap/', (req, res) => {
    getRekap(req, res)
});

//show data semua sesuai attachment yg dipilih
router.get('/get/databyattachment/:attachment_id/:channel', (req, res) => {
    getAllDataByAttachment(req, res)
});

// router.get('/get/allattachment/:channel', (req, res) => {
//     getAllAttachment(req, res)
// });

router.get('/get/alldata/:channel', (req, res) => {
    getAllDataByChannel(req, res)
});

// add params
router.post('/add', (req, res) => {
    addParam(req, res)
});

//read or get data params
router.get('/get/params', (req, res) => {
    getParams(req, res)
});

//read or get data params detail by id
router.get('/get/paramsdetail/:id_parameter', (req, res) => {
    getParamsDetail(req, res)
});

router.get('/get/paramsinput', (req, res) => {
    getParamsInput(req, res)
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
    // var parameters = await getParameter('ovo');


    if (req.file.mimetype.includes("spreadsheet")) {
        await mysqlCon.query(`
                       INSERT INTO attachment ( 
                           attachment_name , import_at , ext_name , channel
                         ) values ( 
                           '${req.file.filename}' , NOW() , '${req.file.mimetype}', 'ovo'
                         )`, function (error, rows, fields) {
            var matchcount = 0;
            var count = 0;
            if (error) {
                res.send({ status: 'failed', desc: error })
            } 
                var workbook = new Excel.Workbook()
                console.log("type : ", req.file.mimetype)
                //3.proses perubahan xlsx menjadi array
                workbook.xlsx.readFile(req.file.path)
                    .then(workbook => {
                        workbook.eachSheet((sheet, id) => {
                            sheet.eachRow((row, rowIndex) => {
                                console.log(row.values, rowIndex)

                                if (row.values.includes("OVO", 4)) {
                                    console.log("ada ovonya")
                                    //4.matching data between dataKonekthing and rows array hasil convert
                                    mysqlCon.query(`
                                   INSERT INTO transaction_import ( channel , transaction_id , bill_no , reference_id , transaction_date , 
                                       payment_date , amount , payment_amount ,
                                       status, isSame , imported_at, updated_at)
                                   SELECT * FROM (SELECT  '${row.values[4]}' as channel , '${row.values[5]}' as transaction_id ,${parseInt(row.values[6])} as bill_no , '${row.values[7]}' as reference_id , CAST('${row.values[11]}' AS datetime) as transaction_date,  
                                   CAST('${row.values[12]}' AS datetime) as payment_date , ${parseInt(row.values[13])} as amount , ${parseInt(row.values[14])} as payment_amount, 
                                  '${row.values[15]}' as status , 0 as isSame, NOW() as imported_at, NOW() as updated_at) AS tmp
                                   WHERE NOT EXISTS (
                                   SELECT transaction_id FROM transaction_import WHERE transaction_id = '${row.values[5]}' AND channel = 'OVO'
                                   ) LIMIT 1`, function (error, rows, fields) {
                                        console.log("data import masuk")
                                        if (error) {
                                            console.log(error)
                                        }
                                        console.log(rows.insertId, "insert file import")
                                        if (rows.insertId !== 0) {

                                            count++
                                            console.log("Count insert import bertambah", count)
                                        }

                                        for (var i = 0; i < dataKonekthing.length; i++) {

                                            if (parseInt(dataKonekthing[i].bill_no) === parseInt(row.values[6])) {

                                                //insert data muslimpocket yang sama
                                                mysqlCon.query(`
                                                   INSERT INTO transaction_mp ( bill_no, sender , receiver , channel ,   
                                                       transaction_id , tgl_transaksi , tgl_pembayaran , total_amount , total_pembayaran,
                                                      nama_penerima ,  bank_penerima , no_rekening_penerima, nama_rekening_penerima, status, isTransfer, imported_at, updated_at)
                                                   SELECT * 
                                                   FROM (
                                                       SELECT  ${parseInt(dataKonekthing[i].bill_reff)} as bill_no, '${dataKonekthing[i].username_pengirim_ovo}' as sender , '${dataKonekthing[i].username_penerima_ovo}' as receiver , 'ovo' as channel , '${dataKonekthing[i].trx_id}' as transaction_id , CAST('${dataKonekthing[i].bill_date}' AS datetime) as tgl_transaksi ,
                                                       CAST('${dataKonekthing[i].payment_date}' AS datetime) as tgl_pembayaran  , ${parseInt(dataKonekthing[i].bill_total)} as total_amount , ${parseInt(dataKonekthing[i].payment_total)} as total_pembayaran,
                                                    "${dataKonekthing[i].masjid_nama}" as nama_penerima , '${dataKonekthing[i].bank_nama}' as bank_penerima , '${dataKonekthing[i].masjid_no_rekening}' as no_rekening_penerima , "${dataKonekthing[i].masjid_pemilik_rekening}" as nama_rekening_penerima, 
                                                    '${dataKonekthing[i].payment_status_desc}' as status, "F" as isTransfer, NOW() as imported_at, NOW() as updated_at) AS tmp
                                                   WHERE NOT EXISTS (
                                                   SELECT transaction_id 
                                                   FROM transaction_mp 
                                                   WHERE transaction_id = '${dataKonekthing[i].trx_id}' AND channel = 'ovo'
                                                   ) 
                                                   LIMIT 1`, function (error, rows, fields) {
                                                    console.log("data import masuk")
                                                    if (error) {
                                                        console.log(error)

                                                    }
                                                    if (rows.insertId !== 0) {
                                                        matchcount++
                                                        console.log("Count insert mp bertambah", matchcount)

                                                    }
                                                    console.log(rows.insertId, "insert yang sama")
                                                    mysqlCon.query(`UPDATE transaction_import 
                                                                           SET isSame = 1 , updated_at = NOW()
                                                               WHERE (bill_no = ${row.values[6]} AND channel = 'OVO') AND isSame = 0`,
                                                        function (error, rows, fields) {
                                                            console.log("update yang sama")
                                                            if (error) {
                                                                console.log(error)

                                                            }
                                                        });
                                                });
                                            }
                                        }


                                    });


                                    console.log("ini data masuk", count)
                                    console.log("ini data sama", matchcount)

                                }

                            })
                        })

                    })

                console.log(`${count} data masuk, ${matchcount} data sama`)
                res.send({ status: 'success', desc: `${count} data masuk, ${matchcount} data sama` })

            
        });



    } else {
        res.status(500).send({ status: 'failed', desc: "Tipe file bukan xlsx" })
    }




}

async function convertCsvLinkAja(req, res) {

    //1.fetching data dari dataKonekthing
    var dataKonekthing = await getDataKonekthing('linkaja');

    //get parameter for shared fee
    var parameters = await getParameter('linkaja');
    if (req.file.mimetype.includes("spreadsheet")) {
        await mysqlCon.query(`
        INSERT INTO attachment ( 
            attachment_name , import_at , ext_name , channel
          ) values ( 
            '${req.file.filename}' , NOW() , '${req.file.mimetype}', 'linkaja'
          )`, async function (error, rows, fields) {
            if (error) {
                res.send({ status: 'failed', desc: error })
            } 
                var count = 0;
                var workbook = new Excel.Workbook()
                console.log("type : ", req.file.mimetype)

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
                                    await mysqlCon.query(`INSERT INTO transaction_import ( channel , transaction_id , bill_no , reference_id , transaction_date , payment_date , amount , payment_amount , status, isSame, imported_at, updated_at)
                    SELECT * FROM (SELECT  'LINKAJA' as channel , '${row.values[1]}' as transaction_id , 0 as bill_no , 
                    '${row.values[1]}' as reference_id , CAST('${newdatetime1}' AS datetime) as transaction_date,  
                    CAST('${newdatetime2}' AS datetime) as payment_date , ${parseInt(row.values[7])} as amount , ${parseInt(row.values[7])} as payment_amount, 
                   '${row.values[5]}' as status , 0 as isSame, NOW() as imported_at, NOW() as updated_at) AS tmp
                    WHERE NOT EXISTS (
                    SELECT transaction_id FROM transaction_import WHERE transaction_id = '${row.values[1]}' AND channel = 'LINKAJA' 
                    ) LIMIT 1`, async function (error, rows, fields) {
                                        if (error) {
                                            console.log(error)
                                        }
                                        for (var i = 0; i < dataKonekthing.length; i++) {
                                            var datetime3 = await row.values[2].split(" ")
                                            var date3 = datetime3[0].split("/").reverse().join("-")
                                            var newdatetime3 = date3.concat(" ", datetime3[1])
                                            if ((moment(`${dataKonekthing[i].transactionDate}`).format('YYYY-MM-DD HH:mm:ss') === moment(`${newdatetime3}`).format('YYYY-MM-DD HH:mm:ss')) && (parseInt(dataKonekthing[i].amount) === parseInt(row.values[7]))) {
                                                await console.log('Insert data muslimpocket')

                                                var datetime5 = await row.values[3].split(" ")
                                                var date5 = datetime5[0].split("/").reverse().join("-")
                                                var newdatetime5 = date5.concat(" ", datetime5[1])
                                                //insert data muslimpocket yang sama
                                                await mysqlCon.query(` 
                                    INSERT INTO transaction_mp ( bill_no, sender , receiver , channel ,   
                                        transaction_id , tgl_transaksi , tgl_pembayaran , total_amount , total_pembayaran,
                                       nama_penerima ,  bank_penerima , no_rekening_penerima, nama_rekening_penerima, status, isTransfer,
                                       imported_at, updated_at)
                                    SELECT * 
                                    FROM (
                                        SELECT  ${parseInt(dataKonekthing[i].trxId)} as bill_no, '${dataKonekthing[i].username_pengirim_linkaja}' as sender , '${dataKonekthing[i].username_penerima_linkaja}' as receiver , 'linkaja' as channel , '${row.values[1]}' as transaction_id , CAST('${newdatetime5}' AS datetime) as tgl_transaksi ,
                                        CAST('${dataKonekthing[i].transactionDate}' AS datetime) as tgl_pembayaran  , ${parseInt(dataKonekthing[i].amount)} as total_amount , ${parseInt(dataKonekthing[i].amount)} as total_pembayaran,
                                     "${dataKonekthing[i].masjid_nama}" as nama_penerima , '${dataKonekthing[i].bank_nama}' as bank_penerima , '${dataKonekthing[i].masjid_no_rekening}' as no_rekening_penerima , "${dataKonekthing[i].masjid_pemilik_rekening}" as nama_rekening_penerima, 
                                     '${dataKonekthing[i].status}' as status, "F" as isTransfer, NOW() as imported_at, NOW() as updated_at) AS tmp
                                    WHERE NOT EXISTS (
                                    SELECT transaction_id , tgl_pembayaran
                                    FROM transaction_mp 
                                    WHERE bill_no = '${dataKonekthing[i].trx_id}' AND channel = 'linkaja'
                                    ) 
                                    LIMIT 1`, function (error, rows, fields) {
                                                    if (error) {
                                                        console.log(error)

                                                    }
                                                });
                                                console.log(rows, "update yang sama")
                                                var datetime4 = await row.values[2].split(" ")
                                                var date4 = datetime4[0].split("/").reverse().join("-")
                                                var newdatetime4 = date4.concat(" ", datetime4[1])
                                                await mysqlCon.query(`UPDATE transaction_import SET isSame = 1, reference_id = '${dataKonekthing[i].refNum}', updated_at = NOW() WHERE (payment_date = CAST('${newdatetime4}' AS datetime) AND channel = 'LINKAJA') AND isSame = 0  `,
                                                    function (error, rows, fields) {
                                                        if (error) {
                                                            console.log(error)

                                                        }
                                                    });

                                                await count++
                                            }
                                        }

                                    });

                                }

                            })
                        })

                    })

                console.log(count)
                res.send({ status: 'success', desc: `${count} data masuk, ${matchcount} data sama`})

        });
    } else {
        res.send("file bukan csv atau xlsx")
    }

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

// function getAllAttachment(req, res) {

//     var sql = `SELECT  * from attachment WHERE channel = '${req.params.channel}'`;

//     mysqlCon.query(sql, function (error, rows, fields) {
//         if (error) {
//             console.log(error)
//         } else {
//             res.send(rows)
//         }
//     });
// }

const getDataMPByChannel = channel => {
    return new Promise(resolve => {
        if (channel === "ovo") {
            var sql = `SELECT  * from transaction_mp tr
            WHERE tr.channel = '${channel}'
            ORDER BY tr.bill_no ASC `;
        } else if (channel === "linkaja") {
            var sql = `SELECT  * from transaction_mp tr
            WHERE tr.channel = '${channel}'
            ORDER BY tr.tgl_pembayaran ASC `;
        } else {
            var sql = `SELECT  * from transaction_mp tr
            WHERE tr.channel = '${channel}' `;
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

const getDataImportByChannel = channel => {
    return new Promise(resolve => {
        if (channel === "ovo") {
            var sql = `SELECT  * from transaction_import tr
            WHERE tr.channel = '${channel}'
            ORDER BY tr.bill_no ASC `;
        } else if (channel === "linkaja") {
            var sql = `SELECT  * from transaction_import tr
            WHERE tr.channel = '${channel}'
            ORDER BY tr.payment_date ASC `;
        } else {
            var sql = `SELECT  * from transaction_import tr
            WHERE tr.channel = '${channel}' `;
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

const getNominalDataImport = channel => {
    return new Promise(resolve => {
        var sql = `SELECT IFNULL(COUNT(id),0) as jumlah_transaksi, IFNULL(SUM(tr.payment_amount),0) as amount from transaction_import tr
        WHERE tr.channel = '${channel}' `;
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

const getNominalDataMP = channel => {
    return new Promise(resolve => {
        var sql = `SELECT IFNULL(COUNT(id),0) as jumlah_transaksi, IFNULL(SUM(tr.total_pembayaran),0) as amount from transaction_mp tr
        WHERE tr.channel = '${channel}' `;
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

async function getAllDataByChannel(req, res) {

    const dataMP = await getDataMPByChannel(req.params.channel)
    const dataImport = await getDataImportByChannel(req.params.channel)
    const nominalImport = await getNominalDataImport(req.params.channel)
    const nominalMP = await getNominalDataMP(req.params.channel)

    if (dataMP && dataImport && nominalImport && nominalMP) {
        res.send({ data_MP: dataMP, data_Import: dataImport, nominal_Import: nominalImport, nominal_MP: nominalMP })
    }
}

const getRekapBank = () => {
    return new Promise(resolve => {
        const sql = `SELECT DATE_FORMAT(tr.tgl_pembayaran,"%Y-%m-%d") as pembayaran_tgl, tr.bank_penerima, count(tr.bank_penerima) as jumlah_transaksi, SUM(tr.total_amount) as nominal_transaksi
        FROM transaction_mp tr
        GROUP BY DATE_FORMAT(tr.tgl_pembayaran,"%Y-%m-%d")  , tr.bank_penerima
        ORDER BY tr.tgl_pembayaran`;
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

const getRakapTrImport = () => {
    return new Promise(resolve => {
        const sql = `SELECT *
        FROM transaction_import tr
        ORDER BY tr.payment_date ASC`;
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

const getRakapTrMP = () => {
    return new Promise(resolve => {
        const sql = `SELECT *
        FROM transaction_mp tr
        ORDER BY tr.tgl_pembayaran ASC `;
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

async function getRekap(req, res) {

    const dataRekapBank = await getRekapBank();
    const dataRekapImport = await getRakapTrImport();
    const dataRekapMP = await getRakapTrMP();

    if (dataRekapBank && dataRekapImport && dataRekapMP) {
        res.send({ rekap_MP: dataRekapMP, rekap_Import: dataRekapImport, rekap_bank: dataRekapBank })
    }
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

    var sql = `INSERT INTO parameter (nama_parameter, nilai_parameter, channel, isDeleted)
                VALUES('${req.body.nama_parameter}','${req.body.nilai_parameter}','${req.body.channel}', 0)`

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            res.send({ status: "error", desc: error })
        } else {
            res.send({ status: "success", desc: "Success" })
        }
    });
}

function updateParam(req, res) {
    var sql = `UPDATE parameter 
                            SET
                            nama_parameter = '${req.body.nama_parameter}' , 
                            nilai_parameter = '${req.body.nilai_parameter}' , 
                            channel = '${req.body.channel}' 
	                                WHERE
                                    id_parameter = '${req.params.id_parameter}' `;
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

function getParamsDetail(req, res) {

    var sql = `SELECT * from parameter p
                WHERE p.id_parameter = '${req.params.id_parameter}' `;

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });
}

function getParamsInput(req, res) {

    const sql = `SELECT p.id_parameter, p.channel FROM parameter p`

    mysqlCon.query(sql, function (error, rows, fields) {
        if (error) {
            console.log(error)
        } else {
            res.send(rows)
        }
    });
}

module.exports = router;