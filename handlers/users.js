const { admin, db } = require('../util/admin');

const config = require('../util/config');

const firebase = require('firebase');
firebase.initializeApp(config);

const { validateSignupData, validateLoginData, reduceUserDetails } = require('../util/validators');
const { user } = require('firebase-functions/lib/providers/auth');

// User registration
exports.signup = (req, res) => {
    const newUser = {
      email: req.body.email,
      password: req.body.password,
      confirmPassword: req.body.confirmPassword,
      handle: req.body.handle,
    };

    const { valid, errors } = validateSignupData(newUser);

    if(!valid) return res.status(400).json(errors);

    const noImg = 'no-img.png';
  
    // User creation // 
    let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
      .then(doc => {
        if(doc.exists){
          return res.status(400).json({ handle: 'This user name is already taken' })
        } else {
          return firebase
            .auth()
            .createUserWithEmailAndPassword(newUser.email, newUser.password)
        }
      })
      .then(data =>{
        userId = data.user.uid;
        return data.user.getIdToken();
      })
      .then(tokenReceived => {
        token = tokenReceived;
        const userCredentials = {
          handle: newUser.handle,
          email: newUser.email,
          createdAt: new Date().toISOString(),
          imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
          userId
        };
        return db.doc(`/users/${newUser.handle}`).set(userCredentials)
      })
        .then(() => {
          return res.status(201).json({ token });
      })
      .catch(err => {
        console.error(err);
        if(err.code === 'auth/email-already-in-use'){
          return res.status(400).json({ email: 'Email is already in use'})
        } else {
          return res.status(500).json({ general: 'Something went wrong, please try again'});
        }
      });
  
  };

// User login
  exports.login = (req, res) => {
const user = {
    email: req.body.email,
    password: req.body.password
};

const { valid, errors } = validateLoginData(user);

if(!valid) return res.status(400).json(errors);

firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then(data => {
      return data.user.getIdToken();
    })
    .then(token => {
      return res.status(200).json({ token });
    })
    .catch(err => {
      console.error(err);
      // auth/wrong-password
      // auth/user-not-user
      return res
        .status(403)
        .json({ general: 'Wrong credentials, please try again'});
    });
};

// Add user details
exports.addUserDetails = (req, res) => {
  let userDetails = reduceUserDetails(req.body);

  db.doc(`users/${req.user.handle}`).update(userDetails)
  .then(() => {
    return res.json({ message: 'Details added succesfully'});
  })
  .catch(err => {
    console.error(err);
    return res.status(500).json({ error: err.code });
  })
};

// Get any user data and snippets. First query
exports.getUserDetails = (req, res) => {
  let lastUserSnippet = {};
  let userData = {};
  db.doc(`/users/${req.params.handle}`).get()
    .then (async doc =>  {
      if(doc.exists){
        userData.user = doc.data();
        await db.collection('snippets')
          .where('userHandle', '==', req.params.handle)
          .orderBy('createdAt', 'asc')
          .limit(1)
          .get()
          .then((data) => { 
            console.log(data);
            console.log(req.params.handle);
            lastUserSnippet = data.docs[data.docs.length-1] 
          })
        return db.collection('snippets')
          .where('userHandle', '==', req.params.handle)
          .orderBy('createdAt', 'desc')
          .limit(3)
          .get()
        } else {
          return res.status(404).json({ error: 'User not found'});
        }
    })
    .then(data => {
      userData.snippets = [];
      let lastVisible = data.docs[data.docs.length-1]
      data.forEach(doc => {
        userData.snippets.push({
          body: doc.data().body,
          audio: doc.data().audio,
          genre: doc.data().genre,
          playCount: doc.data().playCount,
          createdAt: doc.data().createdAt,
          userHandle: doc.data().userHandle,
          userImage: doc.data().userImage,
          likeCount: doc.data().likeCount,
          commentCount: doc.data().commentCount,
          snippetId: doc.id
        })
      });
      return res.json({ userData, lastVisible, lastUserSnippet });
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code })
    });
};

// Get more snippets from one user
exports.getUserSnippetsNext = (req, res) => {
  db.collection('snippets')
    .where('userHandle', '==', req.params.handle)
    .orderBy('createdAt', 'desc')
    .startAfter(req.body._fieldsProto.createdAt.stringValue)
    .limit(3)
    .get()
    .then((data) => {
      let lastVisible = data.docs[data.docs.length-1];
      let userData = { snippets: [] };
      data.forEach((doc) => {
        userData.snippets.push({
          snippetId: doc.id,
          body: doc.data().body,
          audio: doc.data().audio,
          genre: doc.data().genre,
          playCount: doc.data().playCount,
          userHandle: doc.data().userHandle,
          createdAt: doc.data().createdAt,
          commentCount: doc.data().commentCount,
          likeCount: doc.data().likeCount,
          userImage: doc.data().userImage
        });
      });
      return res.json({userData, lastVisible});
    })
    .catch((err) => console.error(err));
};

exports.getMoreSnippetsFromUser = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.params.handle}`).get()
    .then(doc => {
      if(doc.exists){
        userData.user = doc.data();
        return db.collection('snippets')
          .where('userHandle', '==', req.params.handle)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()
      } else {
        return res.status(404).json({ error: 'User not found'});
      }
    })
    .then(data => {
      userData.snippets = [];
      data.forEach(doc => {
        userData.snippets.push({
          body: doc.data().body,
          audio: doc.data().audio,
          genre: doc.data().genre,
          playCount: doc.data().playCount,
          createdAt: doc.data().createdAt,
          userHandle: doc.data().userHandle,
          userImage: doc.data().userImage,
          likeCount: doc.data().likeCount,
          commentCount: doc.data().commentCount,
          snippetId: doc.id
        })
      });
      return res.json(userData);
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code })
    });
};

// Get own user details
exports.getAuthenticatedUser = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.user.handle}`).get()
    .then(doc => {
      if(doc.exists){
        userData.credentials = doc.data();
        return db.collection('likes').where('userHandle', '==',  req.user.handle).get();
      }
    })
    .then(data => {
      userData.likes = [];
      data.forEach(doc => {
        userData.likes.push(doc.data());
      });
      return db.collection('plays').where('userHandle', '==', req.user.handle).get();
    })
    .then(data => {
      userData.plays = [];
      data.forEach(doc => {
        userData.plays.push(doc.data());
      });
      return db.collection('notifications').where('recipient', '==', req.user.handle)
        .orderBy('createdAt', 'desc').limit(10).get();
    })
    .then(data => {
      userData.notifications = [];
      data.forEach(doc => {
        userData.notifications.push({
          recipient: doc.data().recipient,
          sender: doc.data().sender,
          createdAt: doc.data().createdAt,
          snippetId: doc.data().snippetId,
          type: doc.data().type,
          read: doc.data().read,
          notificationId: doc.id
        })
      });
      return res.json(userData);
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code });
    });
};

// Update user's profile picture
exports.uploadImage = (req, res) => {
  const BusBoy = require('busboy');
  const path = require('path');
  const os = require('os');
  const fs = require('fs');

  const busboy = new BusBoy({ headers: req.headers });

  let imageFileName;
  let imageToBeUploaded = {};

  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    if(mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
      return res.status(400).json({ error: 'Wrong file type submitted' });
    };
    const imageExtension = filename.split('.')[filename.split('.').length - 1];
    imageFileName = `${Math.round(Math.random()*10000000000)}.${imageExtension}`;
    const filepath = path.join(os.tmpdir(), imageFileName);
    imageToBeUploaded = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });
  busboy.on('finish', () => {
    admin.storage().bucket().upload(imageToBeUploaded.filepath, {
      resumable: false,
      metadata: {
        metadata: {
          contentType: imageToBeUploaded.mimetype
        }
      }
    })
    .then(() => {
      const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`
      return db.doc(`/users/${req.user.handle}`).update({ imageUrl })
      })
      .then(() => {
        return res.json({ message: 'Image uploaded successfully' })
      })
      .catch(err => {
        console.error(err);
        return res.status(500).json({ error: err.code })
      });
  });
  busboy.end(req.rawBody);
};

exports.markNotificationsRead = (req, res) => {
  let batch = db.batch();
  req.body.forEach(notificationId => {
    const notification = db.doc(`/notifications/${notificationId}`);
    batch.update(notification, { read: true });
  });
  batch.commit()
    .then(() => {
      return res.json({ message: 'Notifications marked read'});
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
}