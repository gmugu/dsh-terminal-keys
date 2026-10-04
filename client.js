window.__ModuleLoader__.load({
	id: 'dsh-terminal-keys',
	factory() {
		const NAMESPACE = 'terminalKeys';
		const ZH = {
			title: '终端按键',
			esc: 'Esc 键',
			tab: 'Tab 键',
			ctrl: 'Ctrl 粘滞键',
			alt: 'Alt 粘滞键',
			up: '上方向键',
			down: '下方向键',
			left: '左方向键',
			right: '右方向键',
			noTerminal: '当前无激活终端',
			readOnly: '终端暂不可写入',
			drag: '拖动移动'
		};
		const EN = {
			title: 'Terminal keys',
			esc: 'Escape',
			tab: 'Tab',
			ctrl: 'Ctrl modifier (sticky)',
			alt: 'Alt modifier (sticky)',
			up: 'Arrow up',
			down: 'Arrow down',
			left: 'Arrow left',
			right: 'Arrow right',
			noTerminal: 'No active terminal',
			readOnly: 'Terminal is not writable',
			drag: 'Drag to move'
		};

		/** Raw sequences written into the PTY, unchanged. */
		const SEQ = { up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D' };
		/** Modifier-decorated arrows (xterm modifyOtherKeys-style 3=Alt 5=Ctrl 7=Ctrl+Alt). */
		const SEQ_ALT = { up: '\x1b[1;3A', down: '\x1b[1;3B', right: '\x1b[1;3C', left: '\x1b[1;3D' };
		const SEQ_CTRL = { up: '\x1b[1;5A', down: '\x1b[1;5B', right: '\x1b[1;5C', left: '\x1b[1;5D' };
		const SEQ_CTRL_ALT = { up: '\x1b[1;7A', down: '\x1b[1;7B', right: '\x1b[1;7C', left: '\x1b[1;7D' };
		/** 'C'.charCodeAt(0) - 64 === 3, the byte Ctrl+C sends. */
		const ctrlCode = (letter) => String.fromCharCode(letter.charCodeAt(0) - 64);

		const POS_KEY = 'terminalKeys:position';
		const DRAG_THRESHOLD = 6;

		const BASE_CSS = [
			'[data-plugin="terminal-keys"]{position:fixed;z-index:2000;font-family:system-ui,"Segoe UI","Microsoft YaHei",sans-serif}',
			'[data-plugin="terminal-keys"].tk-card{display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:12px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 10px 30px rgba(0,0,0,.28);width:196px;box-sizing:border-box;touch-action:none}',
			'.tk-head{display:flex;align-items:center;padding:0 2px;cursor:grab}',
			'.tk-title{color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.tk-grip{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-right:4px;flex:none}',
			'.tk-main{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
			'.tk-key{min-width:0;height:40px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;font-family:inherit;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;cursor:pointer;padding:0}',
			'.tk-key.tk-off{opacity:.4;pointer-events:none}',
			'.tk-key.tk-on{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-brand-primary)}',
			'.tk-flash{position:absolute;left:0;right:0;bottom:100%;margin-bottom:6px;font-size:11px;color:var(--dsw-alias-state-warn-primary);text-align:center;pointer-events:none}'
		].join('\n');

		/** Handheld pointer only: coarse pointer or no hover. Desktop windows stay clean. */
		function touchOnly() {
			return (
				(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
				(window.matchMedia && window.matchMedia('(hover: none)').matches)
			);
		}

		/** The seat component: shell.overlay renders it; the real surface is the body-level widget (see apply). */
		function TerminalKeysSeat() {
			return null;
		}

		/**
		 * Imperative body-level widget. The shell's overlay layer is z-index 20 while
		 * right-sidebar pane cells sit at z-index 40, so a seat-rendered entry is
		 * covered whenever a rightbar tab is expanded; mounting at body level with
		 * z-index 2000 keeps the keys reachable exactly then.
		 *
		 * The panel is a fixed 4×2 grid (Esc Tab Ctrl Alt / arrows). Ctrl and Alt are
		 * sticky modifiers that compose with the user's own keyboard: armed bare keys
		 * are rewritten into control/Meta sequences before the terminal sees them.
		 *
		 * Visibility refresh is event-driven wherever the platform offers events
		 * (mounted session, open-tab membership, pointer mode, the active terminal's
		 * state and navigation stores); a slow 1s poll remains only as the fallback
		 * for the two pull-only facts — the active tab and sidebar expansion.
		 */
		function createWidget(ctx) {
			const t = ctx.locale && ctx.locale.bind ? ctx.locale.bind(NAMESPACE) : (key) => key;
			const styleTag = document.createElement('style');
			styleTag.dataset.plugin = 'terminal-keys';
			styleTag.textContent = BASE_CSS;

			const card = document.createElement('div');
			card.dataset.plugin = 'terminal-keys';
			card.className = 'tk-card';
			card.setAttribute('role', 'toolbar');
			card.setAttribute('aria-label', t('title'));

			const flashNode = document.createElement('div');
			flashNode.className = 'tk-flash';

			const keyButtons = [];
			let ctrlOn = false;
			let altOn = false;
			let flashTimer = null;
			let repeatDelay = null;
			let repeatInterval = null;
			let pollTimer = null;
			let unsubs = [];
			let dragCleanups = [];
			let pos = null;
			// Live event sources for the current terminal occurrence: its view.state
			// store and its tab-domain navigation store. Swapped by identity whenever
			// the active terminal changes; both torn down in destroy().
			let stateUnsub = null;
			let navUnsub = null;
			let watchedView = null;
			let watchedNav = null;

			const el = (tag, className, text) => {
				const node = document.createElement(tag);
				if (className) node.className = className;
				if (text !== undefined) node.textContent = text;
				return node;
			};

			// ---- position: one user-dragged anchor for the panel ----
			const clampTo = (candidate, w, h) => ({
				x: Math.min(Math.max(candidate.x, 4), Math.max(4, window.innerWidth - w - 4)),
				y: Math.min(Math.max(candidate.y, 4), Math.max(4, window.innerHeight - h - 4))
			});
			const boxOf = () => ({ w: Math.max(card.offsetWidth, 44), h: Math.max(card.offsetHeight, 44) });
			const clampPos = (candidate) => {
				const box = boxOf();
				return clampTo(candidate, box.w, box.h);
			};
			const loadPos = () => {
				const box = boxOf();
				try {
					const saved = JSON.parse(window.localStorage.getItem(POS_KEY) ?? 'null');
					if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
						return clampTo({ x: saved.x * window.innerWidth, y: saved.y * window.innerHeight }, box.w, box.h);
					}
				} catch {}
				return clampTo({ x: window.innerWidth - box.w - 10, y: (window.innerHeight - box.h) / 2 }, box.w, box.h);
			};
			const savePos = () => {
				try {
					window.localStorage.setItem(
						POS_KEY,
						JSON.stringify({ x: pos.x / window.innerWidth, y: pos.y / window.innerHeight })
					);
				} catch {}
			};
			const applyPos = () => {
				card.style.left = `${pos.x}px`;
				card.style.top = `${pos.y}px`;
			};

			/** Pointer drag with a movement threshold; a press below it counts as a tap. */
			const makeDraggable = (target, getOrigin) => {
				const onPointerDown = (event) => {
					if (event.button !== undefined && event.button !== 0) return;
					// buttons inside a drag handle keep their own behavior
					if (event.target.closest('button') && event.target.closest('button') !== target) return;
					const start = { x: event.clientX, y: event.clientY };
					const origin = getOrigin();
					let moved = false;
					try {
						target.setPointerCapture(event.pointerId);
					} catch {}
					const onMove = (moveEvent) => {
						const dx = moveEvent.clientX - start.x;
						const dy = moveEvent.clientY - start.y;
						if (!moved && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) moved = true;
						if (moved) {
							pos = clampPos({ x: origin.x + dx, y: origin.y + dy });
							applyPos();
						}
					};
					const onUp = () => {
						target.removeEventListener('pointermove', onMove);
						target.removeEventListener('pointerup', onUp);
						target.removeEventListener('pointercancel', onUp);
						if (moved) savePos();
					};
					target.addEventListener('pointermove', onMove);
					target.addEventListener('pointerup', onUp);
					target.addEventListener('pointercancel', onUp);
					if (event.cancelable) event.preventDefault();
				};
				target.addEventListener('pointerdown', onPointerDown);
				return () => target.removeEventListener('pointerdown', onPointerDown);
			};

			const flash = (message) => {
				flashNode.textContent = message;
				if (flashTimer) clearTimeout(flashTimer);
				flashTimer = setTimeout(() => {
					flashNode.textContent = '';
				}, 1600);
			};

			const activeTerminalView = () => {
				const sessionId = ctx.sidebarRight.mounted.getSnapshot();
				if (!sessionId) return { hasTerminal: false, view: undefined, nav: undefined };
				const tab = ctx.sidebarRight.active();
				if (!tab || tab.kind !== 'terminal') return { hasTerminal: false, view: undefined, nav: undefined };
				try {
					const occurrence = ctx.sidebarRight.tabDomain.occurrence(sessionId, { id: tab.id });
					const navigation = occurrence.navigation.getSnapshot();
					const params = navigation.params;
					const terminalId = params !== undefined && 'terminalId' in params ? params.terminalId : undefined;
					const shellPath = params !== undefined && 'shellPath' in params ? params.shellPath : undefined;
					const view = ctx.webTerminals.view(sessionId, tab.id, navigation.address, terminalId, shellPath);
					return { hasTerminal: true, view, nav: occurrence.navigation };
				} catch {
					return { hasTerminal: false, view: undefined, nav: undefined };
				}
			};

			// ---- live subscriptions to the active terminal's own stores ----
			// view.state also ticks on every screen frame, so its listener refreshes
			// only when `writable` flips; navigation fires once per real navigation.
			const watchView = (view) => {
				if (view === watchedView) return;
				if (stateUnsub) stateUnsub();
				stateUnsub = null;
				watchedView = view;
				if (view && view.state && view.state.subscribe) {
					let lastWritable = !!view.state.getSnapshot().writable;
					stateUnsub = view.state.subscribe(() => {
						const writable = !!view.state.getSnapshot().writable;
						if (writable !== lastWritable) {
							lastWritable = writable;
							update();
						}
					});
				}
			};
			const watchNavigation = (nav) => {
				if (nav === watchedNav) return;
				if (navUnsub) navUnsub();
				navUnsub = null;
				watchedNav = nav;
				if (nav && nav.subscribe) navUnsub = nav.subscribe(update);
			};

			const send = (sequence, after) => {
				const { view } = activeTerminalView();
				const state = view ? view.state.getSnapshot() : undefined;
				if (!view) {
					flash(t('noTerminal'));
					return;
				}
				if (!state || !state.writable) {
					flash(t('readOnly'));
					return;
				}
				view.write(sequence);
				if (after) after();
			};

			const stopRepeat = () => {
				if (repeatDelay) clearTimeout(repeatDelay);
				if (repeatInterval) clearInterval(repeatInterval);
				repeatDelay = null;
				repeatInterval = null;
			};

			// ---- sticky modifiers ----
			const setCtrl = (value) => {
				ctrlOn = value;
				const entry = keyButtons.find((item) => item.id === 'ctrl');
				if (entry) {
					entry.button.classList.toggle('tk-on', ctrlOn);
					entry.button.setAttribute('aria-pressed', String(ctrlOn));
				}
			};
			const setAlt = (value) => {
				altOn = value;
				const entry = keyButtons.find((item) => item.id === 'alt');
				if (entry) {
					entry.button.classList.toggle('tk-on', altOn);
					entry.button.setAttribute('aria-pressed', String(altOn));
				}
			};
			const releaseModifiers = () => {
				setCtrl(false);
				setAlt(false);
			};
			const arrowSequence = (id) => {
				if (ctrlOn && altOn) return SEQ_CTRL_ALT[id];
				if (ctrlOn) return SEQ_CTRL[id];
				if (altOn) return SEQ_ALT[id];
				return SEQ[id];
			};
			const letterSequence = (upper) => {
				if (ctrlOn && altOn) return `\x1b${ctrlCode(upper)}`;
				if (ctrlOn) return ctrlCode(upper);
				return `\x1b${upper.toLowerCase()}`;
			};
			const backspaceSequence = () => {
				if (ctrlOn && altOn) return '\x1b\x17';
				if (ctrlOn) return '\x17';
				return '\x1b\x7f';
			};

			const bindKey = (row, id, label, text, onFire, repeatable) => {
				const button = el('button', 'tk-key', text);
				button.type = 'button';
				button.setAttribute('aria-label', label);
				// keep the terminal's focus: never take it on press
				button.addEventListener('pointerdown', (event) => event.preventDefault());
				button.addEventListener('contextmenu', (event) => event.preventDefault());
				if (repeatable) {
					const step = () => send(onFire());
					button.addEventListener('pointerdown', (event) => {
						if (event.cancelable) event.preventDefault();
						stopRepeat();
						step();
						repeatDelay = setTimeout(() => {
							repeatInterval = setInterval(step, 120);
						}, 430);
					});
					const halt = () => stopRepeat();
					button.addEventListener('pointerup', halt);
					button.addEventListener('pointerleave', halt);
					button.addEventListener('pointercancel', halt);
				} else {
					button.addEventListener('click', () => send(onFire()));
				}
				row.appendChild(button);
				keyButtons.push({ id, button });
				return button;
			};

			const bindModifier = (row, id, label, text, toggle) => {
				const button = el('button', 'tk-key', text);
				button.type = 'button';
				button.setAttribute('aria-label', label);
				button.setAttribute('aria-pressed', 'false');
				button.addEventListener('pointerdown', (event) => event.preventDefault());
				button.addEventListener('click', () => toggle());
				row.appendChild(button);
				keyButtons.push({ id, button });
				return button;
			};

			const build = () => {
				const head = el('div', 'tk-head');
				head.title = t('drag');
				head.appendChild(el('span', 'tk-grip', '⠿'));
				head.appendChild(el('span', 'tk-title', t('title')));
				card.appendChild(head);
				dragCleanups.push(makeDraggable(head, () => ({ x: card.offsetLeft, y: card.offsetTop })));

				// fixed 4×2 grid: Esc Tab Ctrl Alt / ← ↑ ↓ →
				const main = el('div', 'tk-main');
				bindKey(main, 'esc', t('esc'), 'Esc', () => '\x1b', false);
				bindKey(main, 'tab', t('tab'), 'Tab', () => '\t', false);
				// mutually exclusive stickies: arming one releases the other
				bindModifier(main, 'ctrl', t('ctrl'), 'Ctrl', () => {
					setCtrl(!ctrlOn);
					if (ctrlOn) setAlt(false);
				});
				bindModifier(main, 'alt', t('alt'), 'Alt', () => {
					setAlt(!altOn);
					if (altOn) setCtrl(false);
				});
				bindKey(main, 'left', t('left'), '←', () => arrowSequence('left'), true);
				bindKey(main, 'up', t('up'), '↑', () => arrowSequence('up'), true);
				bindKey(main, 'down', t('down'), '↓', () => arrowSequence('down'), true);
				bindKey(main, 'right', t('right'), '→', () => arrowSequence('right'), true);
				card.appendChild(main);
				card.appendChild(flashNode);
			};

			/** Any terminal tab exists for the on-screen session; gates the fallback poll. */
			const anyTerminalTab = () => {
				try {
					const sessionId = ctx.sidebarRight.mounted.getSnapshot();
					if (!sessionId) return false;
					const tabs = ctx.sidebarRight.openTabs.getSnapshot();
					return tabs.some((entry) => entry.sessionId === sessionId && entry.kind === 'terminal');
				} catch {
					return true; // fail open: run the full check instead of skipping
				}
			};

			const update = () => {
				const shown = card.style.display !== 'none';
				// cheap gate first: a hidden panel in an impossible environment (not a
				// touch device, or no terminal tab at all) skips every store read
				if (!shown && (!touchOnly() || !anyTerminalTab())) return;
				const { hasTerminal, view, nav } = activeTerminalView();
				watchView(view);
				watchNavigation(nav);
				const state = view ? view.state.getSnapshot() : undefined;
				const writable = !!(state && state.writable);
				let expanded = false;
				try {
					expanded = ctx.sidebarRight.isExpanded();
				} catch {}
				// handheld + right sidebar expanded + a terminal tab in front
				const visible = touchOnly() && expanded && hasTerminal;
				if (!visible) {
					releaseModifiers();
					card.style.display = 'none';
					return;
				}
				if (card.style.display === 'none') {
					// re-entering the terminal context: re-clamp into a possibly rotated viewport
					pos = clampPos(pos);
					applyPos();
				}
				card.style.display = 'flex';
				const usable = hasTerminal && writable;
				for (const { id, button } of keyButtons) {
					if (id === 'ctrl' || id === 'alt') continue;
					button.classList.toggle('tk-off', !usable);
				}
			};

			// ---- sticky modifiers × the user's own keyboard ----
			// Armed bare keys typed into the terminal surface are rewritten before the
			// terminal consumes them: physical keyboards arrive as keydown; many soft
			// keyboards only as beforeinput on the xterm textarea. Both are intercepted
			// in the capture phase; anything unexpected is left untouched (worst case:
			// the key types normally).
			const inTerminalTarget = (target) =>
				target instanceof Element && typeof target.closest === 'function' && !!target.closest('.xterm');
			const canSendNow = () => {
				const { view } = activeTerminalView();
				const state = view ? view.state.getSnapshot() : undefined;
				return !!(view && state && state.writable);
			};
			const onKeyDownCapture = (event) => {
				if (!ctrlOn && !altOn) return;
				if (event.ctrlKey || event.metaKey || event.altKey) return;
				if (!inTerminalTarget(event.target)) return;
				const key = typeof event.key === 'string' ? event.key : '';
				let sequence = null;
				if (/^[a-z]$/i.test(key)) sequence = letterSequence(key.toUpperCase());
				else if (key === 'ArrowUp') sequence = arrowSequence('up');
				else if (key === 'ArrowDown') sequence = arrowSequence('down');
				else if (key === 'ArrowLeft') sequence = arrowSequence('left');
				else if (key === 'ArrowRight') sequence = arrowSequence('right');
				else if (key === 'Backspace') sequence = backspaceSequence();
				if (sequence === null || !canSendNow()) return;
				event.preventDefault();
				event.stopPropagation();
				send(sequence, releaseModifiers);
			};
			const onBeforeInputCapture = (event) => {
				if (!ctrlOn && !altOn) return;
				if (!inTerminalTarget(event.target)) return;
				if (event.inputType !== 'insertText' || typeof event.data !== 'string' || event.data.length !== 1) return;
				if (!/^[a-z]$/i.test(event.data)) return;
				if (!canSendNow()) return;
				event.preventDefault();
				send(letterSequence(event.data.toUpperCase()), releaseModifiers);
			};

			return {
				mount() {
					document.head.appendChild(styleTag);
					document.body.appendChild(card);
					build();
					pos = loadPos();
					applyPos();
					card.style.display = 'none';
					if (ctx.sidebarRight.mounted && ctx.sidebarRight.mounted.subscribe) {
						unsubs.push(ctx.sidebarRight.mounted.subscribe(update));
					}
					if (ctx.sidebarRight.openTabs && ctx.sidebarRight.openTabs.subscribe) {
						unsubs.push(ctx.sidebarRight.openTabs.subscribe(update));
					}
					window.addEventListener('resize', onResize);
					document.addEventListener('keydown', onKeyDownCapture, true);
					document.addEventListener('beforeinput', onBeforeInputCapture, true);
					for (const query of ['(pointer: coarse)', '(hover: none)']) {
						const mq = window.matchMedia(query);
						if (mq.addEventListener) mq.addEventListener('change', onPointerMode);
					}
					// fallback poll: the active tab and sidebar expansion have no public
				// events, so a slow tick re-checks them; update() gates itself off
				// entirely in impossible states
				pollTimer = setInterval(update, 1000);
					update();
				},
				destroy() {
					stopRepeat();
					if (flashTimer) clearTimeout(flashTimer);
					if (pollTimer) clearInterval(pollTimer);
					for (const unsubscribe of unsubs) unsubscribe();
					unsubs = [];
					if (stateUnsub) stateUnsub();
					if (navUnsub) navUnsub();
					stateUnsub = null;
					navUnsub = null;
					watchedView = null;
					watchedNav = null;
					for (const cleanup of dragCleanups) cleanup();
					dragCleanups = [];
					window.removeEventListener('resize', onResize);
					document.removeEventListener('keydown', onKeyDownCapture, true);
					document.removeEventListener('beforeinput', onBeforeInputCapture, true);
					for (const query of ['(pointer: coarse)', '(hover: none)']) {
						const mq = window.matchMedia(query);
						if (mq.removeEventListener) mq.removeEventListener('change', onPointerMode);
					}
					card.remove();
					styleTag.remove();
				}
			};

			function onResize() {
				pos = clampPos(pos);
				applyPos();
				update();
			}
			function onPointerMode() {
				update();
			}
		}

		function apply(ctx) {
			if (ctx.locale && ctx.locale.register) {
				ctx.effect(() => ctx.locale.register(NAMESPACE, { zh: ZH, en: EN }), 'terminal-keys.locale');
			}
			ctx.effect(
				() => {
					if (!ctx.sidebarRight || !ctx.webTerminals) return () => {};
					const widget = createWidget(ctx);
					widget.mount();
					return () => widget.destroy();
				},
				'terminal-keys.widget'
			);
			ctx.effect(
				() =>
					ctx.slots.inject('shell.overlay', () =>
						ctx.slots.register(
							{
								name: 'shell.overlay',
								id: 'terminal-keys',
								order: 60,
								label: 'Terminal keys'
							},
							TerminalKeysSeat
						)
					),
				'terminal-keys.overlay'
			);
		}

		return { inject: ['slots', 'locale', 'sidebarRight', 'webTerminals'], apply };
	}
});
