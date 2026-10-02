export type PointerRole = 'active' | 'lo' | 'hi' | 'mid' | 'found' | 'excluded'

export interface ArrayPointer {
	index: number
	label: string
	role: PointerRole
}

export interface ArrayStep {
	description: string
	pointers: ArrayPointer[]
}
