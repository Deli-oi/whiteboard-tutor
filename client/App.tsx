import { useCallback, useMemo, useState } from 'react'
import { useValue } from 'tldraw'
import { $activeBoardId, getActiveBoard } from './boards/BoardStore'
import {
	DefaultSizeStyle,
	ErrorBoundary,
	TLComponents,
	Tldraw,
	TldrawUiToastsProvider,
	TLUiOverrides,
} from 'tldraw'
import { TldrawAgentApp } from './agent/TldrawAgentApp'
import {
	TldrawAgentAppContextProvider,
	TldrawAgentAppProvider,
} from './agent/TldrawAgentAppProvider'
import { ChatPanel } from './components/ChatPanel'
import { ChatPanelFallback } from './components/ChatPanelFallback'
import { CustomHelperButtons } from './components/CustomHelperButtons'
import { AgentHighlightOverlayUtil } from './overlays/AgentHighlightOverlayUtil'
import { HtmlShapeUtil } from './shapes/HtmlShapeUtil'
import { TargetAreaTool } from './tools/TargetAreaTool'
import { TargetShapeTool } from './tools/TargetShapeTool'

// Customize tldraw's styles to play to the agent's strengths
DefaultSizeStyle.setDefaultValue('s')

// Custom tools for picking context items
const tools = [TargetShapeTool, TargetAreaTool]
const overlayUtils = [AgentHighlightOverlayUtil]
const shapeUtils = [HtmlShapeUtil]
const overrides: TLUiOverrides = {
	tools: (editor, tools) => {
		return {
			...tools,
			'target-area': {
				id: 'target-area',
				label: 'Pick Area',
				kbd: 'c',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-area')
				},
			},
			'target-shape': {
				id: 'target-shape',
				label: 'Pick Shape',
				kbd: 's',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-shape')
				},
			},
		}
	},
}

function App() {
	const [app, setApp] = useState<TldrawAgentApp | null>(null)
	const activeBoardId = useValue('activeBoardId', () => $activeBoardId.get(), [])
	const persistenceKey = useValue('persistenceKey', () => getActiveBoard().persistenceKey, [])

	const handleUnmount = useCallback(() => {
		setApp(null)
	}, [])

	// Custom components that need the agent app's React context
	const components: TLComponents = useMemo(() => {
		return {
			HelperButtons: () =>
				app && (
					<TldrawAgentAppContextProvider app={app}>
						<CustomHelperButtons />
					</TldrawAgentAppContextProvider>
				),
			// Every visual here is HTML content (see HtmlShapeUtil), not native
			// shapes with color/fill/dash styling - so this panel has nothing to
			// control. Worse than useless: it docks at a fixed point in the top
			// right of the canvas viewport and silently swallows clicks on any
			// html shape placed underneath it (e.g. interactive stepper buttons).
			StylePanel: null,
		}
	}, [app])

	return (
		<TldrawUiToastsProvider>
			<main className="tldraw-agent-container">
				<h1 className="sr-only">Whiteboard Tutor - voice and chat AI tutor with a drawing canvas</h1>
				<div className="tldraw-canvas">
					<Tldraw
						key={activeBoardId}
						persistenceKey={persistenceKey}
						tools={tools}
						shapeUtils={shapeUtils}
						overlayUtils={overlayUtils}
						overrides={overrides}
						components={components}
					>
						<TldrawAgentAppProvider onMount={setApp} onUnmount={handleUnmount} />
					</Tldraw>
				</div>
				<ErrorBoundary fallback={ChatPanelFallback}>
					{app && (
						<TldrawAgentAppContextProvider app={app}>
							<ChatPanel />
						</TldrawAgentAppContextProvider>
					)}
				</ErrorBoundary>
			</main>
		</TldrawUiToastsProvider>
	)
}

export default App
