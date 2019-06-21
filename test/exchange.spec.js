'use strict'

const tests = require('interface-data-exchange/src/test')

tests(require('./testconfig')(true))
tests(require('./testconfig')(false))
