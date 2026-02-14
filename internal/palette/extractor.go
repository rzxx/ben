package palette

import (
	"errors"
	"fmt"
	"image"
	"image/draw"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"os"
	"runtime"
	"sort"
	"sync"
)

const (
	minColorCount    = 3
	maxColorCount    = 10
	defaultWorkerCap = 8
	maxWorkerCap     = 12
)

var paletteScaleTones = []int{50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950}

var defaultExtractOptions = ExtractOptions{
	MaxDimension:            220,
	Quality:                 2,
	ColorCount:              5,
	CandidateCount:          24,
	QuantizationBits:        5,
	AlphaThreshold:          16,
	IgnoreNearWhite:         true,
	IgnoreNearBlack:         false,
	MinLuma:                 0.02,
	MaxLuma:                 0.98,
	MinChroma:               0.03,
	TargetChroma:            0.14,
	MaxChroma:               0.32,
	MinDelta:                0.08,
	DarkBaseLightness:       0.145,
	LightBaseLightness:      0.968,
	DarkLightnessDeviation:  0.045,
	LightLightnessDeviation: 0.03,
	DarkChromaScale:         0.6,
	LightChromaScale:        0.35,
	WorkerCount:             0,
}

type ExtractOptions struct {
	MaxDimension            int     `json:"maxDimension"`
	Quality                 int     `json:"quality"`
	ColorCount              int     `json:"colorCount"`
	CandidateCount          int     `json:"candidateCount"`
	QuantizationBits        int     `json:"quantizationBits"`
	AlphaThreshold          int     `json:"alphaThreshold"`
	IgnoreNearWhite         bool    `json:"ignoreNearWhite"`
	IgnoreNearBlack         bool    `json:"ignoreNearBlack"`
	MinLuma                 float64 `json:"minLuma"`
	MaxLuma                 float64 `json:"maxLuma"`
	MinChroma               float64 `json:"minChroma"`
	TargetChroma            float64 `json:"targetChroma"`
	MaxChroma               float64 `json:"maxChroma"`
	MinDelta                float64 `json:"minDelta"`
	DarkBaseLightness       float64 `json:"darkBaseLightness"`
	LightBaseLightness      float64 `json:"lightBaseLightness"`
	DarkLightnessDeviation  float64 `json:"darkLightnessDeviation"`
	LightLightnessDeviation float64 `json:"lightLightnessDeviation"`
	DarkChromaScale         float64 `json:"darkChromaScale"`
	LightChromaScale        float64 `json:"lightChromaScale"`
	WorkerCount             int     `json:"workerCount"`
}

type ThemePalette struct {
	Primary      *PaletteColor  `json:"primary,omitempty"`
	Dark         *PaletteColor  `json:"dark,omitempty"`
	Light        *PaletteColor  `json:"light,omitempty"`
	Accent       *PaletteColor  `json:"accent,omitempty"`
	ThemeScale   []PaletteTone  `json:"themeScale"`
	AccentScale  []PaletteTone  `json:"accentScale"`
	Gradient     []PaletteColor `json:"gradient"`
	SourceWidth  int            `json:"sourceWidth"`
	SourceHeight int            `json:"sourceHeight"`
	SampleWidth  int            `json:"sampleWidth"`
	SampleHeight int            `json:"sampleHeight"`
	Options      ExtractOptions `json:"options"`
}

type PaletteTone struct {
	Tone  int          `json:"tone"`
	Color PaletteColor `json:"color"`
}

type PaletteColor struct {
	Hex        string  `json:"hex"`
	R          int     `json:"r"`
	G          int     `json:"g"`
	B          int     `json:"b"`
	Population int     `json:"population"`
	Lightness  float64 `json:"lightness"`
	Chroma     float64 `json:"chroma"`
	Hue        float64 `json:"hue"`
}

type Extractor struct{}

func NewExtractor() *Extractor {
	return &Extractor{}
}

func DefaultExtractOptions() ExtractOptions {
	return defaultExtractOptions
}

func NormalizeExtractOptions(options ExtractOptions) ExtractOptions {
	return options.normalized()
}

func (e *Extractor) ExtractFromPath(path string, options ExtractOptions) (ThemePalette, error) {
	file, err := os.Open(path)
	if err != nil {
		return ThemePalette{}, fmt.Errorf("open image: %w", err)
	}
	defer file.Close()

	decoded, _, err := image.Decode(file)
	if err != nil {
		return ThemePalette{}, fmt.Errorf("decode image: %w", err)
	}

	return e.ExtractFromImage(decoded, options)
}

func (e *Extractor) ExtractFromImage(img image.Image, options ExtractOptions) (ThemePalette, error) {
	normalized := options.normalized()
	bounds := img.Bounds()
	if bounds.Empty() {
		return ThemePalette{}, errors.New("image has no pixels")
	}

	source := toNRGBA(img)
	sampled := downscaleNRGBA(source, normalized.MaxDimension, normalized.WorkerCount)

	bins, _, err := buildColorBins(sampled, normalized)
	if err != nil {
		return ThemePalette{}, err
	}

	boxes := buildBoxes(bins, normalized.CandidateCount)
	swatches := boxesToSwatches(boxes)
	if len(swatches) == 0 {
		return ThemePalette{}, errors.New("no color swatches extracted")
	}

	uniqueSwatches := deduplicateSwatches(swatches, normalized.MinDelta)
	selected := selectPaletteSwatches(uniqueSwatches, normalized)
	if len(selected) == 0 {
		return ThemePalette{}, errors.New("unable to select final palette")
	}

	broadCandidates := buildBroadCandidateSwatches(sampled, normalized)
	selection := resolveThemeSelection(uniqueSwatches, selected, broadCandidates, normalized)

	return ThemePalette{
		Primary:      toPaletteColorPointer(selection.primary),
		Dark:         toPaletteColorPointer(selection.dark),
		Light:        toPaletteColorPointer(selection.light),
		Accent:       toPaletteColorPointer(selection.accent),
		ThemeScale:   swatchesToPaletteTones(selection.themeScale),
		AccentScale:  swatchesToPaletteTones(selection.accentScale),
		Gradient:     swatchesToPaletteColors(selection.gradient),
		SourceWidth:  source.Bounds().Dx(),
		SourceHeight: source.Bounds().Dy(),
		SampleWidth:  sampled.Bounds().Dx(),
		SampleHeight: sampled.Bounds().Dy(),
		Options:      normalized,
	}, nil
}

type colorBin struct {
	rq    uint8
	gq    uint8
	bq    uint8
	r     uint8
	g     uint8
	b     uint8
	count int
}

type colorBox struct {
	bins       []colorBin
	population int
	rMin       uint8
	rMax       uint8
	gMin       uint8
	gMax       uint8
	bMin       uint8
	bMax       uint8
	volume     int
}

type swatch struct {
	r          uint8
	g          uint8
	b          uint8
	population int
	lightness  float64
	chroma     float64
	hue        float64
	okL        float64
	okA        float64
	okB        float64
}

func (s swatch) toPaletteColor() PaletteColor {
	return PaletteColor{
		Hex:        fmt.Sprintf("#%02X%02X%02X", s.r, s.g, s.b),
		R:          int(s.r),
		G:          int(s.g),
		B:          int(s.b),
		Population: s.population,
		Lightness:  s.lightness,
		Chroma:     s.chroma,
		Hue:        s.hue,
	}
}

func (o ExtractOptions) normalized() ExtractOptions {
	normalized := o

	if normalized.MaxDimension <= 0 {
		normalized.MaxDimension = defaultExtractOptions.MaxDimension
	}
	normalized.MaxDimension = clampInt(normalized.MaxDimension, 64, 1024)

	if normalized.Quality <= 0 {
		normalized.Quality = defaultExtractOptions.Quality
	}
	normalized.Quality = clampInt(normalized.Quality, 1, 12)

	if normalized.ColorCount <= 0 {
		normalized.ColorCount = defaultExtractOptions.ColorCount
	}
	normalized.ColorCount = clampInt(normalized.ColorCount, minColorCount, maxColorCount)

	if normalized.CandidateCount <= 0 {
		normalized.CandidateCount = maxInt(defaultExtractOptions.CandidateCount, normalized.ColorCount*4)
	}
	normalized.CandidateCount = clampInt(normalized.CandidateCount, normalized.ColorCount, 128)

	if normalized.QuantizationBits <= 0 {
		normalized.QuantizationBits = defaultExtractOptions.QuantizationBits
	}
	normalized.QuantizationBits = clampInt(normalized.QuantizationBits, 4, 6)

	if normalized.AlphaThreshold < 0 {
		normalized.AlphaThreshold = 0
	}
	normalized.AlphaThreshold = clampInt(normalized.AlphaThreshold, 0, 254)

	if normalized.MinLuma <= 0 && normalized.MaxLuma <= 0 {
		normalized.MinLuma = defaultExtractOptions.MinLuma
		normalized.MaxLuma = defaultExtractOptions.MaxLuma
	}
	if normalized.MaxLuma <= 0 {
		normalized.MaxLuma = 1
	}
	normalized.MinLuma = clampFloat(normalized.MinLuma, 0, 1)
	normalized.MaxLuma = clampFloat(normalized.MaxLuma, 0, 1)
	if normalized.MaxLuma < normalized.MinLuma {
		normalized.MaxLuma = normalized.MinLuma
	}

	if normalized.MinChroma <= 0 {
		normalized.MinChroma = defaultExtractOptions.MinChroma
	}
	normalized.MinChroma = clampFloat(normalized.MinChroma, 0, 0.4)

	if normalized.TargetChroma <= 0 {
		normalized.TargetChroma = defaultExtractOptions.TargetChroma
	}
	normalized.TargetChroma = clampFloat(normalized.TargetChroma, 0.02, 0.42)

	if normalized.MaxChroma <= 0 {
		normalized.MaxChroma = defaultExtractOptions.MaxChroma
	}
	normalized.MaxChroma = clampFloat(normalized.MaxChroma, normalized.TargetChroma, 0.5)

	if normalized.MinDelta <= 0 {
		normalized.MinDelta = defaultExtractOptions.MinDelta
	}
	normalized.MinDelta = clampFloat(normalized.MinDelta, 0.01, 0.45)

	if normalized.DarkBaseLightness <= 0 {
		normalized.DarkBaseLightness = defaultExtractOptions.DarkBaseLightness
	}
	normalized.DarkBaseLightness = clampFloat(normalized.DarkBaseLightness, 0.02, 0.35)

	if normalized.LightBaseLightness <= 0 {
		normalized.LightBaseLightness = defaultExtractOptions.LightBaseLightness
	}
	normalized.LightBaseLightness = clampFloat(normalized.LightBaseLightness, 0.75, 0.99)
	if normalized.LightBaseLightness < normalized.DarkBaseLightness+0.2 {
		normalized.LightBaseLightness = minFloat(normalized.DarkBaseLightness+0.2, 0.99)
	}

	if normalized.DarkLightnessDeviation <= 0 {
		normalized.DarkLightnessDeviation = defaultExtractOptions.DarkLightnessDeviation
	}
	normalized.DarkLightnessDeviation = clampFloat(normalized.DarkLightnessDeviation, 0.005, 0.3)

	if normalized.LightLightnessDeviation <= 0 {
		normalized.LightLightnessDeviation = defaultExtractOptions.LightLightnessDeviation
	}
	normalized.LightLightnessDeviation = clampFloat(normalized.LightLightnessDeviation, 0.005, 0.2)

	if normalized.DarkChromaScale <= 0 {
		normalized.DarkChromaScale = defaultExtractOptions.DarkChromaScale
	}
	normalized.DarkChromaScale = clampFloat(normalized.DarkChromaScale, 0.05, 1.4)

	if normalized.LightChromaScale <= 0 {
		normalized.LightChromaScale = defaultExtractOptions.LightChromaScale
	}
	normalized.LightChromaScale = clampFloat(normalized.LightChromaScale, 0.05, 1.2)

	if normalized.WorkerCount <= 0 {
		defaultWorkers := runtime.GOMAXPROCS(0) - 1
		if defaultWorkers < 1 {
			defaultWorkers = 1
		}
		normalized.WorkerCount = minInt(defaultWorkers, defaultWorkerCap)
	}
	maxWorkers := maxInt(1, minInt(runtime.GOMAXPROCS(0), maxWorkerCap))
	normalized.WorkerCount = clampInt(normalized.WorkerCount, 1, maxWorkers)

	return normalized
}

func toNRGBA(img image.Image) *image.NRGBA {
	bounds := img.Bounds()
	dst := image.NewNRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	draw.Draw(dst, dst.Bounds(), img, bounds.Min, draw.Src)
	return dst
}

func downscaleNRGBA(src *image.NRGBA, maxDimension int, workerCount int) *image.NRGBA {
	bounds := src.Bounds()
	sourceWidth := bounds.Dx()
	sourceHeight := bounds.Dy()
	if sourceWidth <= 0 || sourceHeight <= 0 {
		return src
	}

	maxSourceDimension := maxInt(sourceWidth, sourceHeight)
	if maxSourceDimension <= maxDimension {
		return src
	}

	scale := float64(maxDimension) / float64(maxSourceDimension)
	targetWidth := maxInt(int(math.Round(float64(sourceWidth)*scale)), 1)
	targetHeight := maxInt(int(math.Round(float64(sourceHeight)*scale)), 1)

	dst := image.NewNRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	workers := clampInt(workerCount, 1, targetHeight)

	var wg sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		startY, endY := splitRange(targetHeight, workers, worker)
		wg.Add(1)
		go func(start, end int) {
			defer wg.Done()
			xScale := float64(sourceWidth) / float64(targetWidth)
			yScale := float64(sourceHeight) / float64(targetHeight)
			for y := start; y < end; y++ {
				sampleY := (float64(y)+0.5)*yScale - 0.5
				targetRowOffset := y * dst.Stride
				for x := 0; x < targetWidth; x++ {
					sampleX := (float64(x)+0.5)*xScale - 0.5
					r, g, b, a := bilinearSampleNRGBA(src, sampleX, sampleY)
					targetOffset := targetRowOffset + x*4
					dst.Pix[targetOffset] = r
					dst.Pix[targetOffset+1] = g
					dst.Pix[targetOffset+2] = b
					dst.Pix[targetOffset+3] = a
				}
			}
		}(startY, endY)
	}

	wg.Wait()
	return dst
}

func bilinearSampleNRGBA(src *image.NRGBA, x float64, y float64) (uint8, uint8, uint8, uint8) {
	width := src.Bounds().Dx()
	height := src.Bounds().Dy()
	if width <= 0 || height <= 0 {
		return 0, 0, 0, 0
	}

	x = clampFloat(x, 0, float64(width-1))
	y = clampFloat(y, 0, float64(height-1))

	x0 := int(math.Floor(x))
	y0 := int(math.Floor(y))
	x1 := minInt(x0+1, width-1)
	y1 := minInt(y0+1, height-1)

	tx := x - float64(x0)
	ty := y - float64(y0)

	offset00 := y0*src.Stride + x0*4
	offset10 := y0*src.Stride + x1*4
	offset01 := y1*src.Stride + x0*4
	offset11 := y1*src.Stride + x1*4

	w00 := (1 - tx) * (1 - ty)
	w10 := tx * (1 - ty)
	w01 := (1 - tx) * ty
	w11 := tx * ty

	r := w00*float64(src.Pix[offset00]) + w10*float64(src.Pix[offset10]) + w01*float64(src.Pix[offset01]) + w11*float64(src.Pix[offset11])
	g := w00*float64(src.Pix[offset00+1]) + w10*float64(src.Pix[offset10+1]) + w01*float64(src.Pix[offset01+1]) + w11*float64(src.Pix[offset11+1])
	b := w00*float64(src.Pix[offset00+2]) + w10*float64(src.Pix[offset10+2]) + w01*float64(src.Pix[offset01+2]) + w11*float64(src.Pix[offset11+2])
	a := w00*float64(src.Pix[offset00+3]) + w10*float64(src.Pix[offset10+3]) + w01*float64(src.Pix[offset01+3]) + w11*float64(src.Pix[offset11+3])

	return uint8(math.Round(r)), uint8(math.Round(g)), uint8(math.Round(b)), uint8(math.Round(a))
}

func buildColorBins(img *image.NRGBA, options ExtractOptions) ([]colorBin, int, error) {
	width := img.Bounds().Dx()
	height := img.Bounds().Dy()
	if width <= 0 || height <= 0 {
		return nil, 0, errors.New("sample image is empty")
	}

	bits := options.QuantizationBits
	channelMask := (1 << bits) - 1
	channelShift := 8 - bits
	indexShift := bits * 2
	histogramSize := 1 << (bits * 3)

	workers := clampInt(options.WorkerCount, 1, height)
	localHistograms := make([][]int, workers)

	var wg sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		startY, endY := splitRange(height, workers, worker)
		wg.Add(1)
		go func(workerIndex, start, end int) {
			defer wg.Done()
			local := make([]int, histogramSize)

			firstSampleY := start
			if remainder := firstSampleY % options.Quality; remainder != 0 {
				firstSampleY += options.Quality - remainder
			}

			for y := firstSampleY; y < end; y += options.Quality {
				rowOffset := y * img.Stride
				for x := 0; x < width; x += options.Quality {
					offset := rowOffset + x*4
					r := img.Pix[offset]
					g := img.Pix[offset+1]
					b := img.Pix[offset+2]
					a := img.Pix[offset+3]

					if int(a) <= options.AlphaThreshold {
						continue
					}
					if options.IgnoreNearWhite && r >= 245 && g >= 245 && b >= 245 {
						continue
					}
					if options.IgnoreNearBlack && r <= 10 && g <= 10 && b <= 10 {
						continue
					}

					luma := rgbLuma(r, g, b)
					if luma < options.MinLuma || luma > options.MaxLuma {
						continue
					}

					rq := (int(r) >> channelShift) & channelMask
					gq := (int(g) >> channelShift) & channelMask
					bq := (int(b) >> channelShift) & channelMask
					index := (rq << indexShift) | (gq << bits) | bq
					local[index]++
				}
			}

			localHistograms[workerIndex] = local
		}(worker, startY, endY)
	}

	wg.Wait()

	histogram := make([]int, histogramSize)
	totalPixels := 0
	for _, local := range localHistograms {
		if local == nil {
			continue
		}
		for index, count := range local {
			histogram[index] += count
			totalPixels += count
		}
	}

	if totalPixels == 0 {
		return nil, 0, errors.New("no eligible pixels after filtering")
	}

	bins := make([]colorBin, 0, histogramSize/3)
	for index, count := range histogram {
		if count == 0 {
			continue
		}

		rq := uint8((index >> indexShift) & channelMask)
		gq := uint8((index >> bits) & channelMask)
		bq := uint8(index & channelMask)
		bins = append(bins, colorBin{
			rq:    rq,
			gq:    gq,
			bq:    bq,
			r:     quantizedToRGB(rq, bits),
			g:     quantizedToRGB(gq, bits),
			b:     quantizedToRGB(bq, bits),
			count: count,
		})
	}

	return bins, totalPixels, nil
}

func quantizedToRGB(value uint8, bits int) uint8 {
	levels := 1 << bits
	bucketSize := 256 / levels
	center := int(value)*bucketSize + bucketSize/2
	if center > 255 {
		center = 255
	}
	if center < 0 {
		center = 0
	}
	return uint8(center)
}

func buildBoxes(bins []colorBin, targetCount int) []colorBox {
	if len(bins) == 0 {
		return nil
	}

	boxes := []colorBox{newColorBox(bins)}
	for len(boxes) < targetCount {
		splittable := make([]int, 0, len(boxes))
		for index, box := range boxes {
			if box.canSplit() {
				splittable = append(splittable, index)
			}
		}
		if len(splittable) == 0 {
			break
		}

		sort.Slice(splittable, func(i, j int) bool {
			left := boxes[splittable[i]]
			right := boxes[splittable[j]]
			leftScore := float64(left.population) * math.Log(float64(left.volume)+1)
			rightScore := float64(right.population) * math.Log(float64(right.volume)+1)
			return leftScore > rightScore
		})

		split := false
		for _, index := range splittable {
			left, right, ok := splitColorBox(boxes[index])
			if !ok {
				continue
			}

			boxes[index] = boxes[len(boxes)-1]
			boxes = boxes[:len(boxes)-1]
			boxes = append(boxes, left, right)
			split = true
			break
		}

		if !split {
			break
		}
	}

	return boxes
}

func newColorBox(bins []colorBin) colorBox {
	box := colorBox{bins: bins}
	if len(bins) == 0 {
		return box
	}

	box.rMin = bins[0].rq
	box.rMax = bins[0].rq
	box.gMin = bins[0].gq
	box.gMax = bins[0].gq
	box.bMin = bins[0].bq
	box.bMax = bins[0].bq

	for _, bin := range bins {
		box.population += bin.count
		if bin.rq < box.rMin {
			box.rMin = bin.rq
		}
		if bin.rq > box.rMax {
			box.rMax = bin.rq
		}
		if bin.gq < box.gMin {
			box.gMin = bin.gq
		}
		if bin.gq > box.gMax {
			box.gMax = bin.gq
		}
		if bin.bq < box.bMin {
			box.bMin = bin.bq
		}
		if bin.bq > box.bMax {
			box.bMax = bin.bq
		}
	}

	box.volume = int(box.rMax-box.rMin+1) * int(box.gMax-box.gMin+1) * int(box.bMax-box.bMin+1)
	return box
}

func (b colorBox) canSplit() bool {
	return len(b.bins) > 1 && (b.rMax > b.rMin || b.gMax > b.gMin || b.bMax > b.bMin)
}

func splitColorBox(box colorBox) (colorBox, colorBox, bool) {
	if !box.canSplit() {
		return colorBox{}, colorBox{}, false
	}

	axis := longestAxis(box)
	orderedBins := append([]colorBin(nil), box.bins...)

	sort.Slice(orderedBins, func(i, j int) bool {
		left := axisValue(orderedBins[i], axis)
		right := axisValue(orderedBins[j], axis)
		if left == right {
			return orderedBins[i].count > orderedBins[j].count
		}
		return left < right
	})

	targetPopulation := box.population / 2
	cumulativePopulation := 0
	splitIndex := -1
	for index, bin := range orderedBins {
		cumulativePopulation += bin.count
		if cumulativePopulation >= targetPopulation {
			splitIndex = index + 1
			break
		}
	}

	if splitIndex <= 0 || splitIndex >= len(orderedBins) {
		splitIndex = len(orderedBins) / 2
	}
	if splitIndex <= 0 || splitIndex >= len(orderedBins) {
		return colorBox{}, colorBox{}, false
	}

	leftBins := append([]colorBin(nil), orderedBins[:splitIndex]...)
	rightBins := append([]colorBin(nil), orderedBins[splitIndex:]...)
	if len(leftBins) == 0 || len(rightBins) == 0 {
		return colorBox{}, colorBox{}, false
	}

	left := newColorBox(leftBins)
	right := newColorBox(rightBins)
	if left.population == 0 || right.population == 0 {
		return colorBox{}, colorBox{}, false
	}

	return left, right, true
}

func longestAxis(box colorBox) int {
	rRange := box.rMax - box.rMin
	gRange := box.gMax - box.gMin
	bRange := box.bMax - box.bMin

	if rRange >= gRange && rRange >= bRange {
		return 0
	}
	if gRange >= rRange && gRange >= bRange {
		return 1
	}
	return 2
}

func axisValue(bin colorBin, axis int) uint8 {
	switch axis {
	case 0:
		return bin.rq
	case 1:
		return bin.gq
	default:
		return bin.bq
	}
}

func boxesToSwatches(boxes []colorBox) []swatch {
	swatches := make([]swatch, 0, len(boxes))
	for _, box := range boxes {
		if box.population <= 0 {
			continue
		}

		var rSum int
		var gSum int
		var bSum int

		for _, bin := range box.bins {
			rSum += int(bin.r) * bin.count
			gSum += int(bin.g) * bin.count
			bSum += int(bin.b) * bin.count
		}

		r := uint8(rSum / box.population)
		g := uint8(gSum / box.population)
		b := uint8(bSum / box.population)
		okL, okA, okB := rgbToOKLab(r, g, b)
		chroma := math.Sqrt(okA*okA + okB*okB)
		hue := math.Atan2(okB, okA) * (180 / math.Pi)
		if hue < 0 {
			hue += 360
		}

		swatches = append(swatches, swatch{
			r:          r,
			g:          g,
			b:          b,
			population: box.population,
			lightness:  okL,
			chroma:     chroma,
			hue:        hue,
			okL:        okL,
			okA:        okA,
			okB:        okB,
		})
	}

	sort.Slice(swatches, func(i, j int) bool {
		return swatches[i].population > swatches[j].population
	})

	return swatches
}

func deduplicateSwatches(swatches []swatch, threshold float64) []swatch {
	if len(swatches) <= 1 {
		return swatches
	}

	unique := make([]swatch, 0, len(swatches))
	for _, candidate := range swatches {
		duplicateIndex := -1
		for index, existing := range unique {
			if okLabDistance(candidate, existing) <= threshold {
				duplicateIndex = index
				break
			}
		}

		if duplicateIndex < 0 {
			unique = append(unique, candidate)
			continue
		}

		if candidate.population > unique[duplicateIndex].population {
			unique[duplicateIndex] = candidate
		}
	}

	sort.Slice(unique, func(i, j int) bool {
		return unique[i].population > unique[j].population
	})

	return unique
}

func selectPaletteSwatches(swatches []swatch, options ExtractOptions) []swatch {
	if len(swatches) == 0 || options.ColorCount <= 0 {
		return nil
	}

	maxPopulation := float64(swatches[0].population)
	ranked := append([]swatch(nil), swatches...)
	sort.Slice(ranked, func(i, j int) bool {
		left := scoreSwatch(ranked[i], maxPopulation, options)
		right := scoreSwatch(ranked[j], maxPopulation, options)
		if left == right {
			return ranked[i].population > ranked[j].population
		}
		return left > right
	})

	selected := make([]swatch, 0, options.ColorCount)
	collect := func(requireChroma bool, enforceDistance bool) {
		for _, candidate := range ranked {
			if len(selected) >= options.ColorCount {
				return
			}
			if requireChroma && candidate.chroma < options.MinChroma {
				continue
			}
			if containsSwatch(selected, candidate) {
				continue
			}
			if enforceDistance && !isDistinctFromSelection(selected, candidate, options.MinDelta) {
				continue
			}
			selected = append(selected, candidate)
		}
	}

	collect(true, true)
	collect(false, true)
	collect(false, false)

	if len(selected) > options.ColorCount {
		selected = selected[:options.ColorCount]
	}

	return selected
}

func buildBroadCandidateSwatches(img *image.NRGBA, options ExtractOptions) []swatch {
	broad := options
	broad.Quality = 1
	broad.IgnoreNearWhite = false
	broad.IgnoreNearBlack = false
	broad.MinLuma = 0
	broad.MaxLuma = 1
	broad.CandidateCount = clampInt(maxInt(options.CandidateCount, options.ColorCount*6), options.ColorCount, 128)

	bins, _, err := buildColorBins(img, broad)
	if err != nil {
		return nil
	}

	boxes := buildBoxes(bins, broad.CandidateCount)
	swatches := boxesToSwatches(boxes)
	if len(swatches) == 0 {
		return nil
	}

	return deduplicateSwatches(swatches, maxFloat(options.MinDelta*0.55, 0.01))
}

func scoreSwatch(candidate swatch, maxPopulation float64, options ExtractOptions) float64 {
	popScore := float64(candidate.population) / maxPopulation
	lightnessScore := 1 - math.Abs(candidate.lightness-0.58)
	if lightnessScore < 0 {
		lightnessScore = 0
	}
	chromaScore := 1 - (math.Abs(candidate.chroma-options.TargetChroma) / maxFloat(options.TargetChroma, 0.001))
	if chromaScore < 0 {
		chromaScore = 0
	}

	neonPenalty := 1.0
	if candidate.chroma > options.MaxChroma {
		excess := candidate.chroma - options.MaxChroma
		neonPenalty = maxFloat(0.2, 1.0-excess*4.5)
	}

	return (0.52*popScore + 0.33*chromaScore + 0.15*lightnessScore) * neonPenalty
}

func containsSwatch(selected []swatch, target swatch) bool {
	for _, candidate := range selected {
		if candidate.r == target.r && candidate.g == target.g && candidate.b == target.b {
			return true
		}
	}
	return false
}

func isDistinctFromSelection(selected []swatch, candidate swatch, threshold float64) bool {
	if len(selected) == 0 {
		return true
	}

	for _, existing := range selected {
		if okLabDistance(candidate, existing) < threshold {
			return false
		}
	}

	return true
}

type themeSelection struct {
	primary     *swatch
	secondary   *swatch
	tertiary    *swatch
	dark        *swatch
	light       *swatch
	accent      *swatch
	themeScale  []swatch
	accentScale []swatch
	gradient    []swatch
}

func resolveThemeSelection(candidates []swatch, selected []swatch, broadCandidates []swatch, options ExtractOptions) themeSelection {
	selection := themeSelection{}
	if len(selected) == 0 {
		return selection
	}
	if len(candidates) == 0 {
		candidates = append([]swatch(nil), selected...)
	}

	supportCandidates := mergeSwatchPools(broadCandidates, candidates, maxFloat(options.MinDelta*0.35, 0.01))
	if len(supportCandidates) == 0 {
		supportCandidates = append([]swatch(nil), candidates...)
	}

	primary := selected[0]
	selection.primary = swatchPointer(primary)

	gradientChosen := []swatch{primary}
	gradientRoleCandidates := append(selected[1:], candidates...)
	if secondary, ok := firstDistinctSwatch(gradientRoleCandidates, gradientChosen, options.MinDelta); ok {
		selection.secondary = swatchPointer(secondary)
		gradientChosen = append(gradientChosen, secondary)
	}

	if tertiary, ok := firstDistinctSwatch(gradientRoleCandidates, gradientChosen, options.MinDelta*0.92); ok {
		selection.tertiary = swatchPointer(tertiary)
		gradientChosen = append(gradientChosen, tertiary)
	}

	if accent, ok := chooseAccentSwatch(primary, supportCandidates, options); ok {
		selection.accent = swatchPointer(accent)
	} else {
		selection.accent = swatchPointer(primary)
	}

	anchoredDark, anchoredLight := buildAnchoredDarkAndLight(primary, supportCandidates, options)
	selection.dark = anchoredDark
	selection.light = anchoredLight
	selection.themeScale = buildThemeScaleSwatches(selection, options)
	selection.accentScale = buildAccentScaleSwatches(selection, options)

	gradientCandidates := mergeSwatchPools(candidates, supportCandidates, maxFloat(options.MinDelta*0.3, 0.008))
	if len(gradientCandidates) == 0 {
		gradientCandidates = append([]swatch(nil), candidates...)
	}
	selection.gradient = buildGradientSwatches(selection, gradientCandidates, options.MinDelta)
	return selection
}

func buildGradientSwatches(selection themeSelection, candidates []swatch, minDelta float64) []swatch {
	ordered := make([]swatch, 0, 5)

	addSeed := func(seed *swatch, threshold float64) {
		if seed == nil {
			return
		}
		if len(ordered) == 0 || isDistinctFromSelection(ordered, *seed, threshold) {
			ordered = append(ordered, *seed)
		}
	}

	addSeed(selection.primary, minDelta*0.45)
	addSeed(selection.secondary, minDelta*0.42)
	addSeed(selection.tertiary, minDelta*0.4)
	addSeed(selection.dark, minDelta*0.28)
	addSeed(selection.light, minDelta*0.28)

	for len(ordered) < 5 {
		candidate, ok := bestGradientCandidate(candidates, ordered, minDelta)
		if !ok {
			break
		}
		ordered = append(ordered, candidate)
	}

	if len(ordered) == 0 && len(candidates) > 0 {
		ordered = append(ordered, candidates[0])
	}

	if len(ordered) > 0 && len(ordered) < 5 {
		base := append([]swatch(nil), ordered...)
		for index := 0; len(ordered) < 5; index++ {
			ordered = append(ordered, base[index%len(base)])
		}
	}

	if len(ordered) > 5 {
		ordered = ordered[:5]
	}

	return ordered
}

func mergeSwatchPools(primary []swatch, secondary []swatch, threshold float64) []swatch {
	combined := make([]swatch, 0, len(primary)+len(secondary))
	combined = append(combined, primary...)
	combined = append(combined, secondary...)
	if len(combined) == 0 {
		return nil
	}
	return deduplicateSwatches(combined, threshold)
}

func buildAnchoredDarkAndLight(seed swatch, candidates []swatch, options ExtractOptions) (*swatch, *swatch) {
	darkLightness := anchoredRoleLightness(candidates, options.DarkBaseLightness, options.DarkLightnessDeviation, true)
	lightLightness := anchoredRoleLightness(candidates, options.LightBaseLightness, options.LightLightnessDeviation, false)
	if lightLightness <= darkLightness {
		lightLightness = minFloat(0.99, darkLightness+0.2)
	}

	darkMaxChroma := minFloat(options.MaxChroma*0.55, options.TargetChroma*0.85)
	if darkMaxChroma <= 0 {
		darkMaxChroma = 0.08
	}
	lightMaxChroma := minFloat(options.MaxChroma*0.45, options.TargetChroma*0.7)
	if lightMaxChroma <= 0 {
		lightMaxChroma = 0.06
	}

	dark := oklchToSwatch(
		darkLightness,
		anchoredRoleChroma(seed.chroma, options.DarkChromaScale, darkMaxChroma),
		seed.hue,
		seed.population,
	)
	light := oklchToSwatch(
		lightLightness,
		anchoredRoleChroma(seed.chroma, options.LightChromaScale, lightMaxChroma),
		seed.hue,
		seed.population,
	)

	return swatchPointer(dark), swatchPointer(light)
}

func buildThemeScaleSwatches(selection themeSelection, options ExtractOptions) []swatch {
	if selection.dark == nil || selection.light == nil {
		return nil
	}

	seed := fallbackScaleSeed(selection)
	if selection.primary != nil {
		seed = *selection.primary
	}
	lightAnchor := *selection.light
	darkAnchor := *selection.dark

	lightness50 := clampFloat(lightAnchor.lightness+minFloat(0.045, (1-lightAnchor.lightness)*0.8), lightAnchor.lightness, 0.995)
	chroma50 := clampFloat(lightAnchor.chroma*0.7, 0, options.MaxChroma*0.5)

	seedChroma := seed.chroma
	if seedChroma <= 0 {
		seedChroma = options.TargetChroma
	}

	scale := make([]swatch, 0, len(paletteScaleTones))
	for _, tone := range paletteScaleTones {
		switch tone {
		case 50:
			scale = append(scale, oklchToSwatch(lightness50, chroma50, seed.hue, seed.population))
		case 100:
			scale = append(scale, lightAnchor)
		case 950:
			scale = append(scale, darkAnchor)
		default:
			t := float64(tone-100) / float64(950-100)
			lightness := lightAnchor.lightness + (darkAnchor.lightness-lightAnchor.lightness)*t
			endChroma := lightAnchor.chroma + (darkAnchor.chroma-lightAnchor.chroma)*t
			chroma := endChroma
			chroma = clampFloat(chroma, 0, options.MaxChroma)
			scale = append(scale, oklchToSwatch(lightness, chroma, seed.hue, seed.population))
		}
	}

	return scale
}

func buildAccentScaleSwatches(selection themeSelection, options ExtractOptions) []swatch {
	if selection.dark == nil || selection.light == nil {
		return nil
	}

	seed := fallbackScaleSeed(selection)
	if selection.accent != nil {
		seed = *selection.accent
	} else if selection.primary != nil {
		seed = *selection.primary
	}

	upperL := clampFloat(selection.light.lightness+0.01, 0.78, 0.98)
	lowerL := clampFloat(selection.dark.lightness+0.01, 0.10, 0.40)
	if upperL <= lowerL {
		upperL = minFloat(0.98, lowerL+0.25)
	}

	seedChroma := seed.chroma
	if seedChroma <= 0 {
		seedChroma = options.TargetChroma
	}

	peakChroma := clampFloat(maxFloat(seedChroma*1.15, options.TargetChroma*1.35), 0.02, 0.5)
	edgeChroma := clampFloat(peakChroma*0.2, 0, 0.16)

	scale := make([]swatch, 0, len(paletteScaleTones))
	for _, tone := range paletteScaleTones {
		if tone == 50 {
			lightness := clampFloat(upperL+0.02, upperL, 0.99)
			chroma := clampFloat(edgeChroma*0.8, 0, 0.14)
			scale = append(scale, oklchToSwatch(lightness, chroma, seed.hue, seed.population))
			continue
		}

		t := float64(tone-100) / float64(950-100)
		t = clampFloat(t, 0, 1)

		lightness := upperL + (lowerL-upperL)*math.Pow(t, 0.92)
		centerWeight := math.Sin(math.Pi * t)
		centerWeight *= centerWeight
		chroma := edgeChroma + (peakChroma-edgeChroma)*centerWeight
		if tone >= 900 {
			chroma *= 0.82
		}
		chroma = clampFloat(chroma, 0, 0.5)
		scale = append(scale, oklchToSwatch(lightness, chroma, seed.hue, seed.population))
	}

	return scale
}

func fallbackScaleSeed(selection themeSelection) swatch {
	if selection.primary != nil {
		return *selection.primary
	}
	if selection.accent != nil {
		return *selection.accent
	}
	if selection.secondary != nil {
		return *selection.secondary
	}
	if selection.tertiary != nil {
		return *selection.tertiary
	}
	if selection.light != nil {
		return *selection.light
	}
	if selection.dark != nil {
		return *selection.dark
	}
	return swatch{}
}

func anchoredRoleLightness(candidates []swatch, baseLightness float64, deviation float64, preferDark bool) float64 {
	target := baseLightness
	if reference, ok := extremeLightnessFallback(candidates, preferDark); ok {
		target = baseLightness + clampFloat(reference.lightness-baseLightness, -deviation, deviation)
	}
	return clampFloat(target, 0, 1)
}

func anchoredRoleChroma(seedChroma float64, scale float64, maxChroma float64) float64 {
	if seedChroma <= 0 || scale <= 0 || maxChroma <= 0 {
		return 0
	}
	target := seedChroma * scale
	if target > maxChroma {
		target = maxChroma
	}
	return clampFloat(target, 0, 0.5)
}

func extremeLightnessFallback(candidates []swatch, preferDark bool) (swatch, bool) {
	if len(candidates) == 0 {
		return swatch{}, false
	}

	best := candidates[0]
	for _, candidate := range candidates[1:] {
		if preferDark {
			if candidate.lightness < best.lightness || (candidate.lightness == best.lightness && candidate.population > best.population) {
				best = candidate
			}
			continue
		}
		if candidate.lightness > best.lightness || (candidate.lightness == best.lightness && candidate.population > best.population) {
			best = candidate
		}
	}

	return best, true
}

func bestGradientCandidate(candidates []swatch, selected []swatch, minDelta float64) (swatch, bool) {
	if len(candidates) == 0 {
		return swatch{}, false
	}

	maxPopulation := float64(candidates[0].population)
	if maxPopulation <= 0 {
		maxPopulation = 1
	}

	best := swatch{}
	bestScore := -1.0
	found := false

	for _, candidate := range candidates {
		if containsSwatch(selected, candidate) {
			continue
		}

		nearestDistance := nearestOKLabDistance(selected, candidate)
		if len(selected) > 0 && nearestDistance < minDelta*0.28 {
			continue
		}

		popScore := float64(candidate.population) / maxPopulation
		distanceScore := 1.0
		if len(selected) > 0 {
			distanceScore = clampFloat(nearestDistance/maxFloat(minDelta, 0.001), 0, 1)
		}
		hueScore := nearestHueDistance(selected, candidate) / 180
		lightnessScore := nearestLightnessDistance(selected, candidate)
		chromaScore := clampFloat(candidate.chroma/0.34, 0, 1)

		candidateScore := 0.30*popScore + 0.26*distanceScore + 0.2*hueScore + 0.14*lightnessScore + 0.1*chromaScore
		if !found || candidateScore > bestScore {
			best = candidate
			bestScore = candidateScore
			found = true
		}
	}

	return best, found
}

func nearestOKLabDistance(selected []swatch, candidate swatch) float64 {
	if len(selected) == 0 {
		return 1
	}

	best := math.MaxFloat64
	for _, existing := range selected {
		distance := okLabDistance(existing, candidate)
		if distance < best {
			best = distance
		}
	}
	return best
}

func nearestHueDistance(selected []swatch, candidate swatch) float64 {
	if len(selected) == 0 {
		return 180
	}

	best := 180.0
	for _, existing := range selected {
		delta := math.Abs(existing.hue - candidate.hue)
		if delta > 180 {
			delta = 360 - delta
		}
		if delta < best {
			best = delta
		}
	}
	return best
}

func nearestLightnessDistance(selected []swatch, candidate swatch) float64 {
	if len(selected) == 0 {
		return 1
	}

	best := 1.0
	for _, existing := range selected {
		delta := math.Abs(existing.lightness - candidate.lightness)
		if delta < best {
			best = delta
		}
	}
	return best
}

func chooseAccentSwatch(primary swatch, candidates []swatch, options ExtractOptions) (swatch, bool) {
	if len(candidates) == 0 {
		return swatch{}, false
	}

	maxPopulation := float64(candidates[0].population)
	if maxPopulation <= 0 {
		maxPopulation = 1
	}

	targetChroma := clampFloat(
		maxFloat(options.TargetChroma*1.22, options.MinChroma*1.35),
		maxFloat(options.MinChroma, 0.02),
		0.42,
	)
	minDistance := maxFloat(options.MinDelta*0.52, 0.045)

	best := swatch{}
	bestScore := -1.0
	found := false

	for _, candidate := range candidates {
		if candidate.r == primary.r && candidate.g == primary.g && candidate.b == primary.b {
			continue
		}
		if candidate.lightness < 0.20 || candidate.lightness > 0.84 {
			continue
		}
		if candidate.chroma < maxFloat(options.MinChroma*0.7, 0.012) {
			continue
		}

		distance := okLabDistance(primary, candidate)
		if distance < minDistance {
			continue
		}

		hueDelta := math.Abs(primary.hue - candidate.hue)
		if hueDelta > 180 {
			hueDelta = 360 - hueDelta
		}

		hueContrastScore := clampFloat(hueDelta/95, 0, 1)
		hueTargetScore := math.Exp(-math.Pow(hueDelta-88, 2) / (2 * 34 * 34))
		distanceScore := clampFloat(distance/maxFloat(options.MinDelta*1.35, 0.07), 0, 1)
		chromaScore := 1 - math.Abs(candidate.chroma-targetChroma)/maxFloat(targetChroma, 0.001)
		chromaScore = clampFloat(chromaScore, 0, 1)
		populationScore := clampFloat(float64(candidate.population)/maxPopulation, 0, 1)

		penalty := 1.0
		if hueDelta < 24 {
			penalty *= 0.65
		}
		if candidate.chroma > options.MaxChroma*1.2 {
			penalty *= maxFloat(0.35, 1.0-(candidate.chroma-options.MaxChroma*1.2)*3.8)
		}

		score := (0.34*hueTargetScore + 0.22*hueContrastScore + 0.2*distanceScore + 0.16*chromaScore + 0.08*populationScore) * penalty
		if !found || score > bestScore {
			best = candidate
			bestScore = score
			found = true
		}
	}

	if !found || bestScore < 0.36 {
		return swatch{}, false
	}

	return best, true
}

func firstDistinctSwatch(candidates []swatch, selected []swatch, minDelta float64) (swatch, bool) {
	for _, candidate := range candidates {
		if containsSwatch(selected, candidate) {
			continue
		}
		if isDistinctFromSelection(selected, candidate, minDelta) {
			return candidate, true
		}
	}
	return swatch{}, false
}

func swatchPointer(value swatch) *swatch {
	copyValue := value
	return &copyValue
}

func toPaletteColorPointer(value *swatch) *PaletteColor {
	if value == nil {
		return nil
	}
	paletteColor := value.toPaletteColor()
	return &paletteColor
}

func swatchesToPaletteColors(values []swatch) []PaletteColor {
	if len(values) == 0 {
		return nil
	}
	colors := make([]PaletteColor, 0, len(values))
	for _, value := range values {
		colors = append(colors, value.toPaletteColor())
	}
	return colors
}

func swatchesToPaletteTones(values []swatch) []PaletteTone {
	if len(values) == 0 {
		return nil
	}

	result := make([]PaletteTone, 0, minInt(len(values), len(paletteScaleTones)))
	for index, value := range values {
		if index >= len(paletteScaleTones) {
			break
		}
		result = append(result, PaletteTone{
			Tone:  paletteScaleTones[index],
			Color: value.toPaletteColor(),
		})
	}

	return result
}

func rgbLuma(red uint8, green uint8, blue uint8) float64 {
	return (0.2126*float64(red) + 0.7152*float64(green) + 0.0722*float64(blue)) / 255
}

func okLabDistance(left swatch, right swatch) float64 {
	lDiff := left.okL - right.okL
	aDiff := left.okA - right.okA
	bDiff := left.okB - right.okB
	return math.Sqrt(lDiff*lDiff + aDiff*aDiff + bDiff*bDiff)
}

func rgbToOKLab(red uint8, green uint8, blue uint8) (float64, float64, float64) {
	r := srgb8ToLinear(red)
	g := srgb8ToLinear(green)
	b := srgb8ToLinear(blue)

	l := 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
	m := 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
	s := 0.0883024619*r + 0.2817188376*g + 0.6299787005*b

	lRoot := math.Cbrt(l)
	mRoot := math.Cbrt(m)
	sRoot := math.Cbrt(s)

	okL := 0.2104542553*lRoot + 0.7936177850*mRoot - 0.0040720468*sRoot
	okA := 1.9779984951*lRoot - 2.4285922050*mRoot + 0.4505937099*sRoot
	okB := 0.0259040371*lRoot + 0.7827717662*mRoot - 0.8086757660*sRoot

	return okL, okA, okB
}

func oklchToSwatch(lightness float64, chroma float64, hue float64, population int) swatch {
	radians := hue * (math.Pi / 180)
	okA := chroma * math.Cos(radians)
	okB := chroma * math.Sin(radians)

	red, green, blue := okLabToSRGB8(lightness, okA, okB)
	actualL, actualA, actualB := rgbToOKLab(red, green, blue)
	actualChroma := math.Sqrt(actualA*actualA + actualB*actualB)
	actualHue := math.Atan2(actualB, actualA) * (180 / math.Pi)
	if actualHue < 0 {
		actualHue += 360
	}

	return swatch{
		r:          red,
		g:          green,
		b:          blue,
		population: population,
		lightness:  actualL,
		chroma:     actualChroma,
		hue:        actualHue,
		okL:        actualL,
		okA:        actualA,
		okB:        actualB,
	}
}

func okLabToSRGB8(okL float64, okA float64, okB float64) (uint8, uint8, uint8) {
	lPrime := okL + 0.3963377774*okA + 0.2158037573*okB
	mPrime := okL - 0.1055613458*okA - 0.0638541728*okB
	sPrime := okL - 0.0894841775*okA - 1.2914855480*okB

	l := lPrime * lPrime * lPrime
	m := mPrime * mPrime * mPrime
	s := sPrime * sPrime * sPrime

	linearR := 4.0767416621*l - 3.3077115913*m + 0.2309699292*s
	linearG := -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
	linearB := -0.0041960863*l - 0.7034186147*m + 1.7076147010*s

	return linearToSRGB8(linearR), linearToSRGB8(linearG), linearToSRGB8(linearB)
}

func srgb8ToLinear(channel uint8) float64 {
	scaled := float64(channel) / 255
	if scaled <= 0.04045 {
		return scaled / 12.92
	}
	return math.Pow((scaled+0.055)/1.055, 2.4)
}

func linearToSRGB8(channel float64) uint8 {
	if channel <= 0 {
		return 0
	}
	if channel >= 1 {
		return 255
	}

	var encoded float64
	if channel <= 0.0031308 {
		encoded = channel * 12.92
	} else {
		encoded = 1.055*math.Pow(channel, 1.0/2.4) - 0.055
	}

	encoded = clampFloat(encoded, 0, 1)
	return uint8(math.Round(encoded * 255))
}

func splitRange(length int, workers int, workerIndex int) (int, int) {
	chunkSize := length / workers
	remainder := length % workers
	start := workerIndex*chunkSize + minInt(workerIndex, remainder)
	end := start + chunkSize
	if workerIndex < remainder {
		end++
	}
	return start, end
}

func clampInt(value int, minimum int, maximum int) int {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}

func clampFloat(value float64, minimum float64, maximum float64) float64 {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func minFloat(left float64, right float64) float64 {
	if left < right {
		return left
	}
	return right
}

func maxFloat(left float64, right float64) float64 {
	if left > right {
		return left
	}
	return right
}
