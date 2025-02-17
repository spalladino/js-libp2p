/* eslint-env mocha */

import { mockUpgrader } from '@libp2p/interface-mocks'
import { FaultTolerance } from '@libp2p/interface-transport'
import { EventEmitter } from '@libp2p/interfaces/events'
import { createEd25519PeerId, createFromJSON } from '@libp2p/peer-id-factory'
import { webSockets } from '@libp2p/websockets'
import * as filters from '@libp2p/websockets/filters'
import { multiaddr } from '@multiformats/multiaddr'
import { expect } from 'aegir/chai'
import sinon from 'sinon'
import { DefaultAddressManager } from '../../src/address-manager/index.js'
import { codes as ErrorCodes } from '../../src/errors.js'
import { createLibp2p } from '../../src/index.js'
import { plaintext } from '../../src/insecure/index.js'
import { DefaultTransportManager } from '../../src/transport-manager.js'
import { MULTIADDRS_WEBSOCKETS } from '../fixtures/browser.js'
import Peers from '../fixtures/peers.js'
import type { Components } from '../../src/components.js'
import type { Libp2p } from '@libp2p/interface-libp2p'
import type { PeerId } from '@libp2p/interface-peer-id'

const listenAddr = multiaddr('/ip4/127.0.0.1/tcp/0')

describe('Transport Manager (WebSockets)', () => {
  let tm: DefaultTransportManager
  let components: Components

  before(async () => {
    const events = new EventEmitter()
    components = {
      peerId: await createEd25519PeerId(),
      events,
      upgrader: mockUpgrader({ events })
    } as any
    components.addressManager = new DefaultAddressManager(components, { listen: [listenAddr.toString()] })

    tm = new DefaultTransportManager(components)
  })

  afterEach(async () => {
    await tm.removeAll()
    expect(tm.getTransports()).to.be.empty()
  })

  it('should be able to add and remove a transport', async () => {
    const transport = webSockets({
      filter: filters.all
    })

    expect(tm.getTransports()).to.have.lengthOf(0)
    tm.add(transport())

    expect(tm.getTransports()).to.have.lengthOf(1)
    await tm.remove('@libp2p/websockets')
    expect(tm.getTransports()).to.have.lengthOf(0)
  })

  it('should not be able to add a transport twice', async () => {
    tm.add(webSockets()())

    expect(() => {
      tm.add(webSockets()())
    })
      .to.throw()
      .and.to.have.property('code', ErrorCodes.ERR_DUPLICATE_TRANSPORT)
  })

  it('should be able to dial', async () => {
    tm.add(webSockets({ filter: filters.all })())
    const addr = MULTIADDRS_WEBSOCKETS[0]
    const connection = await tm.dial(addr)
    expect(connection).to.exist()
    await connection.close()
  })

  it('should fail to dial an unsupported address', async () => {
    tm.add(webSockets({ filter: filters.all })())
    const addr = multiaddr('/ip4/127.0.0.1/tcp/0')
    await expect(tm.dial(addr))
      .to.eventually.be.rejected()
      .and.to.have.property('code', ErrorCodes.ERR_TRANSPORT_UNAVAILABLE)
  })

  it('should fail to listen with no valid address', async () => {
    tm.add(webSockets({ filter: filters.all })())

    await expect(tm.listen([listenAddr]))
      .to.eventually.be.rejected()
      .and.to.have.property('code', ErrorCodes.ERR_NO_VALID_ADDRESSES)
  })
})

describe('libp2p.transportManager (dial only)', () => {
  let peerId: PeerId
  let libp2p: Libp2p

  before(async () => {
    peerId = await createFromJSON(Peers[0])
  })

  afterEach(async () => {
    sinon.restore()

    if (libp2p != null) {
      await libp2p.stop()
    }
  })

  it('fails to start if multiaddr fails to listen', async () => {
    libp2p = await createLibp2p({
      peerId,
      addresses: {
        listen: ['/ip4/127.0.0.1/tcp/0']
      },
      transports: [webSockets()],
      connectionEncryption: [plaintext()],
      start: false
    })

    expect(libp2p.isStarted()).to.be.false()
    await expect(libp2p.start()).to.eventually.be.rejected
      .with.property('code', ErrorCodes.ERR_NO_VALID_ADDRESSES)
  })

  it('does not fail to start if provided listen multiaddr are not compatible to configured transports (when supporting dial only mode)', async () => {
    libp2p = await createLibp2p({
      peerId,
      addresses: {
        listen: ['/ip4/127.0.0.1/tcp/0']
      },
      transportManager: {
        faultTolerance: FaultTolerance.NO_FATAL
      },
      transports: [
        webSockets()
      ],
      connectionEncryption: [
        plaintext()
      ],
      start: false
    })

    expect(libp2p.isStarted()).to.be.false()
    await expect(libp2p.start()).to.eventually.be.undefined()
  })

  it('does not fail to start if provided listen multiaddr fail to listen on configured transports (when supporting dial only mode)', async () => {
    libp2p = await createLibp2p({
      peerId,
      addresses: {
        listen: ['/ip4/127.0.0.1/tcp/12345/p2p/QmWDn2LY8nannvSWJzruUYoLZ4vV83vfCBwd8DipvdgQc3/p2p-circuit']
      },
      transportManager: {
        faultTolerance: FaultTolerance.NO_FATAL
      },
      transports: [
        webSockets()
      ],
      connectionEncryption: [
        plaintext()
      ],
      start: false
    })

    expect(libp2p.isStarted()).to.be.false()
    await expect(libp2p.start()).to.eventually.be.undefined()
  })
})
