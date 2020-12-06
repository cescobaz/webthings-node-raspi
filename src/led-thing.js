'use strict'

const {
  Property,
  Thing,
  Value
} = require('webthing')
const Gpio = require('onoff').Gpio

function updateLed (led, inverted, identifier) {
  return (v) => {
    const value = ((v && !inverted) || (inverted && !v)) ? 1 : 0
    led.writeSync(value)
    console.log('led value ' + identifier, value)
  }
}

function makeLedThing ({ pin, identifier, name, isLight, inverted }) {
  const types = ['OnOffSwitch']
  if (isLight) {
    types.push('Light')
  }
  const thing = new Thing(
    `urn:dev:ops:${identifier}`,
    name,
    types,
    name)
  const led = new Gpio(pin, 'out')
  const value = new Value(false, updateLed(led, inverted, identifier))
  updateLed(led, inverted, identifier)(false)
  thing.addProperty(
    new Property(thing, 'on', value, {
      '@type': 'OnOffProperty',
      title: 'On/Off',
      type: 'boolean',
      description: `Whether the ${name} is turned on`
    }))
  return thing
}

module.exports = { makeLedThing }
