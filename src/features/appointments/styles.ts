// The client side's form styles. First use: BookingView; second: CancelView.

// A text field a thumb can reach, as wide as a phone allows.
export const field = {
	display: "block",
	width: "100%",
	maxWidth: 320,
	boxSizing: "border-box",
	minHeight: 44,
	fontSize: "1em",
} as const;

export const buttons = { display: "flex", gap: 8, flexWrap: "wrap" } as const;

// A button tall enough for a thumb.
export const action = { minHeight: 44, minWidth: 88, fontSize: "1em" } as const;
