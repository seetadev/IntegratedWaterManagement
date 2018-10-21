'use strict';

const express = require('express');
const session = require('express-session');
const XeroClient = require('xero-node').AccountingAPIClient;;
const exphbs = require('express-handlebars');
const logger = require('morgan')
const bodyParser = require('body-parser')
const keys = require('./config/keys.js')
const drone = require('./config/drone.js')
const SDK = require('ringcentral')
const rcsdk = new SDK({
    server: keys.ringCentral.server,
    appKey: keys.ringCentral.appKey,
    appSecret: keys.ringCentral.appSecret,
    redirectUri: '' // optional, but is required for Implicit Grant and Authorization Code OAuth Flows (see below)
});

var app = express();

var exbhbsEngine = exphbs.create({
    defaultLayout: 'main',
    layoutsDir: __dirname + '/views/layouts',
    partialsDir: [
        __dirname + '/views/partials/'
    ],
    helpers: {
        ifCond: function(v1, operator, v2, options) {

            switch (operator) {
                case '==':
                    return (v1 == v2) ? options.fn(this) : options.inverse(this);
                case '===':
                    return (v1 === v2) ? options.fn(this) : options.inverse(this);
                case '!=':
                    return (v1 != v2) ? options.fn(this) : options.inverse(this);
                case '!==':
                    return (v1 !== v2) ? options.fn(this) : options.inverse(this);
                case '<':
                    return (v1 < v2) ? options.fn(this) : options.inverse(this);
                case '<=':
                    return (v1 <= v2) ? options.fn(this) : options.inverse(this);
                case '>':
                    return (v1 > v2) ? options.fn(this) : options.inverse(this);
                case '>=':
                    return (v1 >= v2) ? options.fn(this) : options.inverse(this);
                case '&&':
                    return (v1 && v2) ? options.fn(this) : options.inverse(this);
                case '||':
                    return (v1 || v2) ? options.fn(this) : options.inverse(this);
                default:
                    return options.inverse(this);
            }
        },
        debug: function(optionalValue) {
            console.log("Current Context");
            console.log("====================");
            console.log(this);

            if (optionalValue) {
                console.log("Value");
                console.log("====================");
                console.log(optionalValue);
            }
        }
    }
});

app.engine('handlebars', exbhbsEngine.engine);

app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views');

app.use(logger('combined'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// app.use(express.bodyParser());

app.set('trust proxy', 1);
app.use(session({
    secret: 'something crazy',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.use(express.static(__dirname + '/assets'));

function getXeroClient(session) {
    let config = {};
    try {
        config = require('./config/config.json');
    } catch (ex) {
        if (process && process.env && process.env.APPTYPE) {
            //no config file found, so check the process.env.
            config.appType = process.env.APPTYPE.toLowerCase();
            config.callbackUrl = process.env.authorizeCallbackUrl;
            config.consumerKey = process.env.consumerKey;
            config.consumerSecret = process.env.consumerSecret;
        } else {
            throw "Config not found";
        }
    }

    return new XeroClient(config, session);
}

async function authorizeRedirect (req, res, returnTo) {
    var xeroClient = getXeroClient(req.session);
    let requestToken = await xeroClient.oauth1Client.getRequestToken();

    var authoriseUrl = xeroClient.oauth1Client.buildAuthoriseUrl(requestToken);
    req.session.oauthRequestToken = requestToken;
    req.session.returnTo = returnTo;
    console.log("RETURN TO " + returnTo)
    console.log("URL" + authoriseUrl)
    res.redirect(authoriseUrl);
}

function authorizedOperation(req, res, returnTo, callback) {
    if (req.session.accessToken) {
        callback(getXeroClient(req.session.accessToken));
    } else {
        authorizeRedirect(req, res, returnTo);
    }
}

function handleErr(err, req, res, returnTo) {
    console.log(err);
    if (err.data && err.data.oauth_problem && err.data.oauth_problem == "token_rejected") {
        authorizeRedirect(req, res, returnTo);
    } else {
        res.redirect('error', err);
    }
}

app.get('/error', function(req, res) {
    console.log(req.query.error);
    res.render('index', { error: req.query.error });
})

// Home Page
app.get('/', function(req, res) {
    res.render('index', {
        active: {
            overview: true
        }
    });
});

// Redirected from xero with oauth results
app.get('/access', async function(req, res) {
    var xeroClient = getXeroClient();

    let savedRequestToken = req.session.oauthRequestToken;
    let oauth_verifier = req.query.oauth_verifier;
    let accessToken = await xeroClient.oauth1Client.swapRequestTokenforAccessToken(savedRequestToken, oauth_verifier);

    req.session.accessToken = accessToken;

    var returnTo = req.session.returnTo;
    console.log(returnTo)
    res.redirect(  returnTo || '/' );
});

app.get('/organisations', async function(req, res) {
    authorizedOperation(req, res, '/organisations', async function(xeroClient) {
        try {
            let organisations = await xeroClient.organisations.get()
            res.render('organisations', {
                organisations: organisations.Organisations,
                active: {
                    organisations: true,
                    nav: {
                        accounting: true
                    }
                }
            })
        } catch (err) {
            handleErr(err, req, res, 'organisations');
        }

    })
});

app.get('/brandingthemes', async function(req, res) {
    authorizedOperation(req, res, '/brandingthemes', async function(xeroClient) {
        try {
            let brandingThemes = await xeroClient.brandingThemes.get();

            res.render('brandingthemes', {
                brandingthemes: brandingThemes.BrandingThemes,
                active: {
                    brandingthemes: true,
                    nav: {
                        accounting: true
                    }
                }
            });

        } catch (error) {
            handleErr(error, req, res, 'brandingthemes');
        }
    })
});

app.get('/invoicereminders', async function(req, res) {
    authorizedOperation(req, res, '/invoicereminders', function(xeroClient) {
        xeroClient.invoiceReminders.get()
            .then(function(result) {
                res.render('invoicereminders', {
                    invoicereminders: result.InvoiceReminders,
                    active: {
                        invoicereminders: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'invoicereminders');
            })
    })
});

app.get('/taxrates', async function(req, res) {
    authorizedOperation(req, res, '/taxrates', function(xeroClient) {
        xeroClient.taxRates.get()
            .then(function(result) {
                res.render('taxrates', {
                    taxrates: result.TaxRates,
                    active: {
                        taxrates: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'taxrates');
            })
    })
});

app.get('/users', async function(req, res) {
    authorizedOperation(req, res, '/users', function(xeroClient) {
        xeroClient.users.get()
            .then(function(result) {
                res.render('users', {
                    users: result.Users,
                    active: {
                        users: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'users');
            })
    })
});

app.get('/contacts', async function(req, res) {
    authorizedOperation(req, res, '/contacts', function(xeroClient) {
        var contacts = [];
        xeroClient.contacts.get()
            .then(function(result) {
                res.render('contacts', {
                    contacts: result.Contacts,
                    active: {
                        contacts: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'contacts');
            })
    })
});

app.get('/currencies', async function(req, res) {
    authorizedOperation(req, res, '/currencies', function(xeroClient) {
        xeroClient.currencies.get()
            .then(function(result) {
                res.render('currencies', {
                    currencies: result.Currencies,
                    active: {
                        currencies: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'currencies');
            });
    })
});

app.get('/banktransactions', async function(req, res) {
    authorizedOperation(req, res, '/banktransactions', function(xeroClient) {
        var bankTransactions = [];
        xeroClient.bankTransactions.get()
            .then(function(result) {
                res.render('banktransactions', {
                    bankTransactions: result.BankTransactions,
                    active: {
                        banktransactions: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'banktransactions');
            })
    })
});

app.get('/journals', async function(req, res) {
    authorizedOperation(req, res, '/journals', function(xeroClient) {
        xeroClient.journals.get()
            .then(function(result) {
                res.render('journals', {
                    journals: result.Journals,
                    active: {
                        journals: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'journals');
            })
    })
});

app.get('/banktransfers', async function(req, res) {
    authorizedOperation(req, res, '/banktransfers', function(xeroClient) {
        xeroClient.bankTransfers.get()
            .then(function(result) {
                res.render('banktransfers', {
                    bankTransfers: result.BankTransfers,
                    active: {
                        banktransfers: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'banktransfers');
            })
    })
});

app.get('/payments', async function(req, res) {
    authorizedOperation(req, res, '/payments', function(xeroClient) {
        xeroClient.payments.get()
            .then(function(result) {
                res.render('payments', {
                    payments: result.Payments,
                    active: {
                        payments: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'payments');
            })
    })
});

app.get('/trackingcategories', async function(req, res) {
    authorizedOperation(req, res, '/trackingcategories', function(xeroClient) {
        xeroClient.trackingCategories.get()
            .then(function* (result) {
                res.render('trackingcategories', {
                    trackingcategories: result.TrackingCategories,
                    active: {
                        trackingcategories: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'trackingcategories');
            })
    })
});

app.get('/accounts', async function(req, res) {
    authorizedOperation(req, res, '/accounts', function(xeroClient) {
        xeroClient.accounts.get()
            .then(function(result) {
                res.render('accounts', {
                    accounts: result.Accounts,
                    active: {
                        accounts: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'accounts');
            })
    })
});

app.get('/creditnotes', async function(req, res) {
    authorizedOperation(req, res, '/creditnotes', function(xeroClient) {
        xeroClient.creditNotes.get()
            .then(function(result) {
                res.render('creditnotes', {
                    creditnotes: result.CreditNotes,
                    active: {
                        creditnotes: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'creditnotes');
            })
    })
});

app.get('/invoices', async function(req, res) {
    authorizedOperation(req, res, '/invoices', function(xeroClient) {
        xeroClient.invoices.get()
            .then(function(result) {
                res.render('invoices', {
                    invoices: result.Invoices,
                    active: {
                        invoices: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'invoices');
            })

    })
});

app.get('/repeatinginvoices', async function(req, res) {
    authorizedOperation(req, res, '/repeatinginvoices', function(xeroClient) {
        xeroClient.repeatingInvoices.get()
            .then(function(result) {
                res.render('repeatinginvoices', {
                    repeatinginvoices: result.RepeatingInvoices,
                    active: {
                        repeatinginvoices: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'repeatinginvoices');
            })

    })
});

app.get('/items', async function(req, res) {
    authorizedOperation(req, res, '/items', function(xeroClient) {
        xeroClient.items.get()
            .then(function(result) {
                res.render('items', {
                    items: result.Items,
                    active: {
                        items: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'items');
            })

    })
});

app.get('/manualjournals', async function(req, res) {
    authorizedOperation(req, res, '/manualjournals', function(xeroClient) {
        xeroClient.manualJournals.get()
            .then(function(result) {
                res.render('manualjournals', {
                    manualjournals: result.ManualJournals,
                    active: {
                        manualjournals: true,
                        nav: {
                            accounting: true
                        }
                    }
                });
            })
            .catch(function(err) {
                handleErr(err, req, res, 'manualjournals');
            })
    })
});

app.use('/createinvoice', async function(req, res) {
    if (req.method == 'GET') {
        return res.render('createinvoice');
    } else if (req.method == 'POST') {
        try {
            authorizedOperation(req, res, '/createinvoice', async function(xeroClient) {
                var invoice = await xeroClient.invoices.create({
                    Type: req.body.Type,
                    Contact: {
                        Name: req.body.Contact
                    },
                    DueDate: '2014-10-01',
                    LineItems: [{
                        Description: req.body.Description,
                        Quantity: req.body.Quantity,
                        UnitAmount: req.body.Amount,
                        AccountCode: 400,
                        ItemCode: 'ABC123'
                    }],
                    Status: 'DRAFT'
                });

                res.render('createinvoice', { outcome: 'Invoice created', id: invoice.InvoiceID })

            })
        }
        catch (err) {
            res.render('createinvoice', { outcome: 'Error', err: err })

        }
    }
});

app.post('/mail', function(req, res){
    var mail = req.body.mail
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(keys.sendGrid.apiKey);
    const id = drone.drone.id
    const name = drone.drone.name
    const latitude = drone.drone.latitude
    const longitude = drone.drone.longitude
    const status= drone.drone.status
    const on_off= drone.drone.on_off
    const temp = drone.drone.temp
    const contactPerson = drone.drone.contactPerson
    const data =  "<p><ol><li><strong>ID : </strong>" + id +
               "</li><li><strong>Name : </strong>" + name +
               "</li><li><strong>Latitude : </strong>" + latitude +
               "</li><li><strong>Longitude : </strong>" + longitude +
               "</li><li><strong>Status : </strong>" + status +
               "</li><li><strong>ON/OFF : </strong>" + on_off +
               "</li><li><strong>Temperature : </strong>" + temp +
               "</li><li><strong>Contact Person : </strong>" + contactPerson +
               "</li></ol></p>"
    const msg = {
        to:  mail || 'geetanshu2502@gmail.com',
        from: 'test@example.com',
        subject: 'Details of Drone (Test Mail)',
        html: data,
    };
    sgMail.send(msg);
    console.log("Mail has been sent!!");
    res.redirect('/')
})

app.post('/sms', function(req, res){
    var phone = req.body.phone
    rcsdk.platform().login({
        username: keys.ringCentral.user, // phone number in full format
        extension: keys.ringCentral.extension, // leave blank if direct number is used
        password: keys.ringCentral.password
    })
    .then(function(response) {
          // your code here
          rcsdk.platform().post('/account/~/extension/~/sms', {
              from: {phoneNumber:'+14242136813'}, // Your sms-enabled phone number
              to: [
                  {phoneNumber:phone} // Second party's phone number
              ],
              text: 'Hello, World!'
          })
          .then(function(response) {
              console.log(phone)
              console.log('Message has been sent!')
          })
          .catch(function(e) {
              console.log(e)
              console.log('There was an error!Please try again!')
          });
    })
    .catch(function(e) {
        alert(e.message  || 'Server cannot authorize user');
    });

    res.redirect('/')
})

app.use(function(req, res, next) {
    if (req.session)
        delete req.session.returnto;
})

var PORT = process.env.PORT || 3100;

app.listen(PORT);
console.log("listening on http://localhost:" + PORT);
