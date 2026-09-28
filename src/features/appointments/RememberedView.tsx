import { strings, summary } from "./strings.ts";
import { useRemembered } from "./useRemembered.ts";

const list = { paddingLeft: 20 } as const;

// "Your appointments", when the phone remembers one still to come.
export function RememberedView() {
	const appointments = useRemembered();
	if (appointments.length === 0) return null;
	return (
		<section>
			<h2>{strings.remembered}</h2>
			<ul style={list}>
				{appointments.map((a) => (
					<li key={a.bookingCode}>
						{strings.rememberedLine(
							summary(a.startsAt, a.timeZone, a.professionalName),
							a.bookingCode,
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
