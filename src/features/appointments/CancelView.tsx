import type { FormEvent } from "react";
import { cancelErrorStrings, strings, summary } from "./strings.ts";
import { action, buttons, field } from "./styles.ts";
import { useCancel } from "./useCancel.ts";

// "Cancel with a booking code", between "Your appointments" and the booking
// steps.
export function CancelView() {
	const { state, open, close, typePhone, typeCode, submit } = useCancel();
	const { busy, message, cancelled } = state;

	if (!state.open) {
		return (
			<section>
				<button type="button" style={action} onClick={open}>
					{strings.cancelWithCode}
				</button>
			</section>
		);
	}

	if (cancelled) {
		return (
			<section>
				<h2>{strings.cancelHeading}</h2>
				<h3>{strings.cancelled}</h3>
				<p>
					{summary(
						cancelled.startsAt,
						cancelled.timeZone,
						cancelled.professional.name,
					)}
				</p>
				<p>{strings.timeFreeAgain}</p>
				<button type="button" style={action} onClick={close}>
					{strings.done}
				</button>
			</section>
		);
	}

	const submitForm = (event: FormEvent) => {
		event.preventDefault();
		submit();
	};

	return (
		<section>
			<h2>{strings.cancelHeading}</h2>
			{message && (
				<div role="alert">
					<p>{cancelErrorStrings[message]}</p>
					{message === "ServerUnreachable" && (
						<button
							type="button"
							style={action}
							disabled={busy}
							onClick={submit}
						>
							{strings.tryAgain}
						</button>
					)}
				</div>
			)}
			<form noValidate onSubmit={submitForm}>
				<p>
					<label htmlFor="cancel-phone">{strings.phone}</label>
					<input
						id="cancel-phone"
						type="tel"
						autoComplete="tel"
						value={state.phone}
						onChange={(event) => typePhone(event.target.value)}
						style={field}
					/>
				</p>
				<p>
					<label htmlFor="cancel-code">{strings.bookingCode}</label>
					<input
						id="cancel-code"
						autoCapitalize="characters"
						autoComplete="off"
						value={state.code}
						onChange={(event) => typeCode(event.target.value)}
						style={field}
					/>
				</p>
				<div style={buttons}>
					<button type="submit" style={action} disabled={busy}>
						{strings.cancelAppointment}
					</button>
					<button type="button" style={action} disabled={busy} onClick={close}>
						{strings.back}
					</button>
				</div>
			</form>
		</section>
	);
}
