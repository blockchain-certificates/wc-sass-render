#!/usr/bin/env node
import process from 'node:process';
import { runCli } from '../runCli.js';

runCli(process.argv).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
