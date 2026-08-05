import '../styles.css'
import { isPersistent } from '../lib/storage'
import { watchOtherTabs } from '../lib/cellar'
import { ModeSwitch } from './elements/mode-switch'
import { AppStatus } from './elements/app-status'
import { AppPanel } from './elements/app-panel'
import { AppFoot } from './elements/app-foot'
import { MyWines } from './elements/my-wines'

/**
 * The app entry point.
 *
 * This file registers the custom elements and does the handful of one-off
 * wirings that belong to the document rather than to any section. What it
 * deliberately does *not* contain is a list of `subscribe(render)` calls: each
 * element subscribes for itself, so a new section cannot be added and left
 * unwired, and a tab switch cannot leak a listener.
 */

/**
 * Definitions must be registered before any markup emitting these tags is
 * parsed or mounted. An unknown tag parses fine and sits inert, so getting
 * this wrong produces a blank section rather than an error. Everything is in
 * one bundle and the shell markup is static, so ordering here is enough.
 */
const ELEMENTS: Array<[string, CustomElementConstructor]> = [
  ['mode-switch', ModeSwitch],
  ['app-status', AppStatus],
  ['app-panel', AppPanel],
  ['app-foot', AppFoot],
  ['my-wines', MyWines],
]

export function defineElements(): void {
  for (const [tag, ctor] of ELEMENTS) {
    if (!customElements.get(tag)) customElements.define(tag, ctor)
  }
}

export function start(): void {
  defineElements()

  // Notification, not merge — two tabs are last-write-wins by design. This
  // exists so the losing tab stops showing a list that is no longer true.
  watchOtherTabs()

  // Render-once, so it is a plain DOM write rather than a StoreElement: the
  // answer cannot change within a session.
  const note = document.querySelector('.head-status')
  if (note) {
    note.textContent = isPersistent()
      ? 'saved in this browser'
      : 'not saved — this browser is blocking storage'
    if (!isPersistent()) note.classList.add('head-status--warn')
  }
}

start()
