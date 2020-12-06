'use strict'

const {
  Property,
  Thing,
  Value
} = require('webthing')
const { exec, spawn } = require('child_process')

function makeVideoCamera ({ identifier, name, hlsFilename, dashFilename, imageFilename, mediaDirectory, takeSnapshot }) {
  const thing = new Thing(
    `urn:dev:ops:${identifier}`,
    name,
    ['VideoCamera', 'Camera'],
    name)
  makeStreamingProperties(thing, dashFilename, hlsFilename, mediaDirectory)
  const snapshotingValue = makeSnapshotProperties(thing, imageFilename)
  const mediaRoute = makeMediaRoute(imageFilename, snapshotingValue, takeSnapshot, mediaDirectory)
  return { videoCamera: thing, mediaRoute }
}

function makeStreamingProperties (thing, dashFilename, hlsFilename, mediaDirectory) {
  const videoValue = new Value(null)
  const links = []
  if (dashFilename) {
    links.push({ rel: 'alternate', mediaType: 'application/dash+xml', href: `/media/${dashFilename}` })
  }
  if (hlsFilename) {
    links.push({ rel: 'alternate', mediaType: 'application/vnd.apple.mpegurl', href: `/media/${hlsFilename}` })
  }
  thing.addProperty(
    new Property(thing, 'video', videoValue, {
      '@type': 'VideoProperty',
      title: 'Video',
      links,
      readOnly: true
    }))
  let waiting = false
  let pid = null
  const streamingValue = new Value(false, (v) => {
    if (waiting) {
      return !v
    }
    if (pid) {
      console.log('videoCamera killing streaming process')
      kill(pid)
      pid = null
    }
    if (v) {
      console.log('videoCamera starting streaming process')
      waiting = true
      startDashVideoStreaming(mediaDirectory).then((newPid) => {
        waiting = false
        pid = newPid
      }).catch(error => {
        console.log(error)
        waiting = false
        pid = null
      })
    }
  })
  thing.addProperty(
    new Property(thing, 'streaming', streamingValue, {
      '@type': 'OnOffProperty',
      type: 'boolean',
      title: 'Streaming'
    }))
}

function takeSnapshotRaspi (destinationPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('raspistill', ['-o', destinationPath])
    child.on('error', (error) => {
      reject(error)
    })
    child.on('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error('exit code ' + code))
        return
      }
      resolve(destinationPath)
    })
  })
}

function startDashVideoStreaming (destinationDirectory) {
  return new Promise((resolve, reject) => {
    let pid = null
    const child = spawn('scripts/raspi-camera-dash-start.sh', [destinationDirectory])
    child.stdout.on('data', (data) => {
      console.log(`startDashVideoStreaming Received chunk ${data}`)
      pid = data
    })
    child.on('error', (error) => {
      console.log('startDashVideoStreaming error', pid, error)
      resolve(pid)
    })
    child.on('exit', (code) => {
      console.log('startDashVideoStreaming exited', pid, code)
      resolve(pid)
    })
  })
}

function kill (pid) {
  return new Promise((resolve, reject) => {
    exec(`kill "${pid}"`, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve(pid)
    })
  })
}

function makeSnapshotProperties (thing, imageFilename) {
  const imageValue = new Value(null)
  thing.addProperty(
    new Property(thing, 'image', imageValue, {
      '@type': 'ImageProperty',
      title: 'Snapshot',
      links: [{ rel: 'alternate', mediaType: 'image/jpeg', href: `/media/${imageFilename}` }],
      readOnly: true
    }))
  const snapshotingValue = new Value(false)
  thing.addProperty(
    new Property(thing, 'snapshoting', snapshotingValue, {
      '@type': 'OnOffProperty',
      type: 'boolean',
      title: 'Snapshoting',
      readOnly: true
    }))
  return snapshotingValue
}

function makeMediaRoute (imageFilename, snapshotingValue, takeSnapshot, mediaDirectory) {
  return {
    path: '/media/:file(*)',
    handler: (req, res, next) => {
      const requestedFile = req.params.file
      console.log('media route requested file', requestedFile)
      if (requestedFile === imageFilename) {
        snapshotRouteHandler(res, next, snapshotingValue, takeSnapshot)
        return
      }
      res.download(`${mediaDirectory}/${requestedFile}`, function (err) {
        if (err) return next(err)
      })
    }
  }
}

function snapshotRouteHandler (res, next, snapshotingValue, takeSnapshot) {
  snapshotingValue.notifyOfExternalUpdate(true)
  takeSnapshot().then((filePath) => {
    snapshotingValue.notifyOfExternalUpdate(false)
    res.download(filePath, function (err) {
      if (err) return next(err)
    })
  }).catch(error => {
    snapshotingValue.notifyOfExternalUpdate(false)
    console.log(error)
  })
}

module.exports = { makeVideoCamera, takeSnapshotRaspi }
