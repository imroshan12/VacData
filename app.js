require('dotenv').config();
const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const mongoose = require('mongoose');
const _ = require('lodash');
const nodemailer = require('nodemailer');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findorCreate = require('mongoose-findorcreate')

const app = express();


app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));

app.use(session({
  secret: process.env.SECRET_CODE,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

//Connecti to mongoose local server
mongoose.connect('mongodb+srv://' + process.env.MONGODB_CLOUD + '@cluster0.6j0xj.mongodb.net/cowinDB', {useNewUrlParser: true, useUnifiedTopology: true});
mongoose.set("useCreateIndex", true);

//Creating mongoose schema object
const userSchema = new mongoose.Schema({
  // name: String,
  password: String,
  username: String,
  googleId: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findorCreate);

//Mongoose model
const User = mongoose.model('User', userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

let email = "";

const callBackUrl = "http://localhost:3000";
// const callBackUrl = "https://ancient-garden-21790.herokuapp.com";

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: callBackUrl + "/auth/google/pin",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function(accessToken, refreshToken, profile, cb) {
    // console.log(profile);

    email = profile.emails[0].value;
    console.log(email);

    User.findOrCreate({googleId: profile.id, username: email }, function (err, user) {
      return cb(err, user);
    });
  }
));

app.get("/", (req, res)=>{
  res.render('index');
})

app.get('/auth/google',
  passport.authenticate('google', { scope:
  	[ 'email', 'profile' ] }
));

app.get( '/auth/google/pin',
    passport.authenticate( 'google', {
        successRedirect: '/pin',
        failureRedirect: '/'
}));

app.get("/signup", (req, res)=>{
  res.render('sign', {sign: "/signup", button: "Sign Up"});
});

app.get("/signin", (req, res)=>{
  res.render('sign', {sign: "/signin", button: "Sign In"});
});

app.get("/pin", function(req, res){
  if (req.isAuthenticated()){
    res.render("pin");
  }
  else {
    res.redirect("/");
  }
});

function join(t, a, s) {
   function format(m) {
      let f = new Intl.DateTimeFormat('en', m);
      return f.format(t);
   }
   return a.map(format).join(s);
}

app.post("/pin", (req, res)=>{
  let options = [{day: '2-digit'}, {month: '2-digit'}, {year: 'numeric'}];
  let today = join(new Date, options, '-');
  let pin = req.body.pin;
  let centers = "";
  console.log(pin);

  const cowin_endpoint = 'https://cdn-api.co-vin.in/api/v2/appointment/sessions/public/findByPin?pincode=' + pin + '&date=' + today;
  https.get(cowin_endpoint, (response)=>{
    response.on('data', (data)=>{
      const x = JSON.parse(data);
      console.log(x);
      let i = x.sessions.length;
      (x.sessions).forEach((sess)=>{
          var centerDetails = "NAME:- " + sess.name + "\nADDRESS:- " + sess.address + "\nVACCINE:- " + sess.vaccine + "\nAGE:- " + sess.min_age_limit + "+\nDOSE1:- " + sess.available_capacity_dose1 + "\nDOSE2:- " + sess.available_capacity_dose2;
          centers += centerDetails + "\n\n";
      })


      var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.MAIL_ID,
          pass: process.env.PASSWORD
        }
      });

      var subject = "There are " + i + " vaccination centers near your area."

      var mailOptions = {
        from: process.env.MAIL_ID,
        to: email,
        subject: subject,
        text: centers
      };

      transporter.sendMail(mailOptions, function(error, info){
        if (error) {
          console.log(error);
        } else {
          console.log('Email sent: ' + info.response);
        }
      });


      console.log(centers);
    })
  })
  res.sendFile(__dirname + "/success.html");
})

app.post("/signin", (req, res)=>{
  // const inputName = req.body.name;
  const inputEmail = req.body.email;
  const password = req.body.password;

  const user = new User({
  username: inputEmail,
  password: password
  });
  req.login(user, function(err){
  if (err) {
    console.log(err);
  } else {
    passport.authenticate("local")(req, res, function(){
      res.redirect("/pin");
    });
  }
  });
})

app.post("/signup", (req, res)=>{
  const username = req.body.email;
  const password = req.body.password;

  User.register({username: username}, req.body.password, function(err, user){
  if (err) {
    console.log(err);
    res.redirect("/signup");
  } else {
    passport.authenticate("local")(req, res, function(){
      res.redirect("/pin");
    });
  }
});
  console.log(req.body);
})

app.listen(process.env.PORT || 3000, ()=>{
  console.log("Server is up and running..");
})
