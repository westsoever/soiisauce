#!/usr/bin/env bun
// The `soii` command. All the logic is in app/cli/.
import { main } from '../app/cli/main'

process.exit(await main(process.argv.slice(2)))
