<h1 align="center">
    <img src="https://raw.githubusercontent.com/taciturnaxolotl/bundom/master/.github/images/corgi.png" width="200" alt="Logo"/><br/>
    <img src="https://raw.githubusercontent.com/taciturnaxolotl/carriage/master/.github/images/transparent.png" height="45" width="0px"/>
    Bundom
    <img src="https://raw.githubusercontent.com/taciturnaxolotl/carriage/master/.github/images/transparent.png" height="30" width="0px"/>
</h1>

<p align="center">
    <i>Accomplishing domination of pixel land.</i>
</p>

<p align="center">
	<img src="https://raw.githubusercontent.com/taciturnaxolotl/carriage/master/.github/images/line-break-thin.svg" />
</p>

<p align="center">
	<img src="https://raw.githubusercontent.com/taciturnaxolotl/bundom/master/running.png" />
</p>

<p align="center">
	<img src="https://raw.githubusercontent.com/taciturnaxolotl/carriage/master/.github/images/line-break-thin.svg" />
</p>

## What's this?

Bundom is a quick project I made to achieve domination of [place.danieldb.uk](https://place.danieldb.uk/). It is a swarm based model that relies on a server I host at `hackclub.app:38425` to assign blocks of pixels to clients. The client then draws the pixels on the canvas and `ack` back to the server. The server then assigns the next block of pixels to the client and the process repeats until the canvas is filled. The cool part though is that this is all done in such a way that its almost effortless to setup a client. Registration is automatic and the client is ✨kind✨ fault tolerant.

## How do I use it?

```bash
bun install
```

Then run the following command to start the client:

```bash
bun run swarm/client.ts
```

Also make sure to have this in your `.env` file:

```bash
BEARER_TOKEN=test
SERVER_URL=http://hackclub.app:38425
```

### Hosting

I'm hosting on nest so I just setup a systemd service file that runs `bun run swarm/server.ts` in the root dir of this repo. Then I setup caddy but was having issues with the ip not being passed properly so I just used the raw port lol.

```bash
BEARER_TOKEN=test
PORT=3000 # Optional
```

### Usage

You litterally just need to run it. It will automatically register with the server and start drawing pixels. The server will assign you a block of pixels to draw and you just draw them. Once you're done you `ack` back to the server and it will assign you the next block of pixels. The server will keep assigning you blocks of pixels until the canvas is filled.

```bash
bun run swarm/client.ts
```

<p align="center">
	<img src="https://raw.githubusercontent.com/taciturnaxolotl/carriage/master/.github/images/line-break.svg" />
</p>

<p align="center">
	&copy 2024-present <a href="https://github.com/taciturnaxolotl">Kieran Klukas</a>
</p>

<p align="center">
	<a href="https://github.com/taciturnaxolotl/bundom/blob/master/LICENSE.md"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=MIT&logoColor=d9e0ee&colorA=363a4f&colorB=b7bdf8"/></a>
</p>
