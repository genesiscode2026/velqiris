#!/usr/bin/env node
'use strict';
require('../server-factory').runServer({ name: 'stdout-framing-broken', stdoutNoise: true });
