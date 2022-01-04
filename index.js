/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
navigator.getUserMedia =
	navigator.getUserMedia ||
	navigator.webkitGetUserMedia ||
	navigator.mozGetUserMedia

const audioContext = new window.AudioContext()
const compressor = audioContext.createDynamicsCompressor()
const analyser = audioContext.createAnalyser()

const canvas = document.querySelector('canvas')
canvas.width = document.body.clientWidth
canvas.height = document.body.clientHeight

let samples = 256

const pitchDisplay = document.querySelector('.pitch')
const freq = document.querySelector('.freq')

const minSamples = 0
const buf = new Float32Array(1024)
const getPitch = function (buffer) {
	const size = buffer.length
	const maxSamples = Math.floor(size / 2)
	let bestOffset = -1
	let bestCorrelation = 0
	let rms = 0
	const correlations = []

	let i = 0
	while (i < size) {
		const val = buffer[i]
		rms += val * val
		i++
	}
	rms = Math.sqrt(rms / size)
	// not enough signal
	if (rms < 0.01) {
		return '-'
	}

	let lastCorrelation = 1

	let offset = minSamples
	while (offset < maxSamples) {
		let correlation = 0

		i = 0
		while (i < maxSamples) {
			correlation += Math.abs(buffer[i] - buffer[i + offset])
			i++
		}

		correlation = 1 - correlation / maxSamples
		correlations[offset] = correlation

		if (correlation > 0.9 && correlation > lastCorrelation) {
			foundGoodCorrelation = true
			if (correlation > bestCorrelation) {
				bestCorrelation = correlation
				bestOffset = offset
			}
		} else if (foundGoodCorrelation) {
			const shift =
				(correlations[bestOffset + 1] - correlations[bestOffset - 1]) /
				correlations[bestOffset]
			return audioContext.sampleRate / (bestOffset + 8 * shift)
		}

		lastCorrelation = correlation
		offset++
	}

	if (bestCorrelation > 0.01) {
		return audioContext.sampleRate / bestOffset
	}
	// no good match
	return -1
}

const noteFromPitch = function (frequency) {
	const noteStrings = [
		'C',
		'C#',
		'D',
		'D#',
		'E',
		'F',
		'F#',
		'G',
		'G#',
		'A',
		'A#',
		'B',
	]
	let noteNum = 12 * (Math.log(frequency / 440) / Math.log(2))
	noteNum = Math.round(noteNum) + 69
	return noteStrings[noteNum % 12]
}

const updatePitch = function () {
	const normalize = function (num) {
		const multiplier = Math.pow(10, 2)
		return Math.round(num * multiplier) / multiplier
	}

	analyser.getFloatTimeDomainData(buf)
	const pitch = Yin_pitchEstimation(buf, 44100)
	if (pitch == 0) return
	/*  we convert to RGB from an HSL format because HSL allows us to more easily assign frequencies to colors,
            and RGB allows gradient transitions rather than shortest distance wheel transitions  */
	let rgb = hslToRgb(pitch % 360, 1, 0.5)
	document.getElementById(
		'screen'
	).style.backgroundColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`

	pitchDisplay.innerHTML = noteFromPitch(pitch)
	return (freq.innerHTML = pitch)
}

const visualize = function () {
	const normalize = (y, h) => (y / 256) * h
	const w = canvas.width
	const h = canvas.height
	const points = new Uint8Array(samples)
	analyser.getByteTimeDomainData(points)

	const drawContext = canvas.getContext('2d')
	drawContext.clearRect(0, 0, w, h)

	drawContext.strokeStyle = '#C2EDF2'
	drawContext.lineWidth = 3
	drawContext.lineCap = 'butt'
	drawContext.lineJoin = 'miter'
	drawContext.beginPath()
	drawContext.moveTo(0, normalize(points[0], h))

	let i = 0
	while (i < points.length) {
		drawContext.lineTo((w * (i + 1)) / points.length, normalize(points[i], h))
		i++
	}

	return drawContext.stroke()
}

var animationLoop = function () {
	visualize()
	updatePitch()
	return window.requestAnimationFrame(animationLoop)
}

navigator.getUserMedia(
	{ audio: true },
	function (stream) {
		const microphone = audioContext.createMediaStreamSource(stream)
		microphone.connect(compressor)
		compressor.connect(analyser)

		return window.requestAnimationFrame(animationLoop)
	},
	(e) => console.log(`error: ${e}`)
)
