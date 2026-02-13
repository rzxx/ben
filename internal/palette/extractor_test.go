package palette

import (
	"image"
	"image/color"
	"math"
	"runtime"
	"testing"
)

func TestExtractFromImageGeneratesPalette(t *testing.T) {
	t.Parallel()

	img := image.NewNRGBA(image.Rect(0, 0, 256, 256))
	fillRect(img, image.Rect(0, 0, 128, 128), color.NRGBA{R: 198, G: 48, B: 59, A: 255})
	fillRect(img, image.Rect(128, 0, 256, 128), color.NRGBA{R: 24, G: 144, B: 242, A: 255})
	fillRect(img, image.Rect(0, 128, 128, 256), color.NRGBA{R: 242, G: 188, B: 12, A: 255})
	fillRect(img, image.Rect(128, 128, 256, 256), color.NRGBA{R: 36, G: 184, B: 92, A: 255})

	extractor := NewExtractor()
	palette, err := extractor.ExtractFromImage(img, ExtractOptions{
		ColorCount:       5,
		CandidateCount:   24,
		MaxDimension:     180,
		Quality:          1,
		QuantizationBits: 5,
	})
	if err != nil {
		t.Fatalf("extract palette: %v", err)
	}

	if palette.Primary == nil {
		t.Fatal("expected primary color")
	}
	if palette.Secondary == nil {
		t.Fatal("expected secondary color")
	}
	if palette.Tertiary == nil {
		t.Fatal("expected tertiary color")
	}
	if len(palette.Gradient) != 5 {
		t.Fatalf("expected 5 gradient colors, got %d", len(palette.Gradient))
	}
	if palette.SourceWidth != 256 || palette.SourceHeight != 256 {
		t.Fatalf("unexpected source dimensions: %dx%d", palette.SourceWidth, palette.SourceHeight)
	}
	if palette.SampleWidth > 180 || palette.SampleHeight > 180 {
		t.Fatalf("expected sample dimensions to be downscaled to <= 180, got %dx%d", palette.SampleWidth, palette.SampleHeight)
	}
	if palette.Accent == nil {
		t.Fatal("expected accent color")
	}
}

func TestExtractFromImageRejectsTransparentImages(t *testing.T) {
	t.Parallel()

	img := image.NewNRGBA(image.Rect(0, 0, 32, 32))
	extractor := NewExtractor()

	_, err := extractor.ExtractFromImage(img, ExtractOptions{})
	if err == nil {
		t.Fatal("expected error for fully transparent image")
	}
}

func TestExtractFromImageCapturesDarkAndLightOnHighContrastCover(t *testing.T) {
	t.Parallel()

	img := image.NewNRGBA(image.Rect(0, 0, 320, 320))
	fillRect(img, img.Bounds(), color.NRGBA{R: 70, G: 216, B: 92, A: 255})

	fillRect(img, image.Rect(24, 32, 296, 78), color.NRGBA{R: 8, G: 8, B: 8, A: 255})
	fillRect(img, image.Rect(24, 96, 280, 136), color.NRGBA{R: 8, G: 8, B: 8, A: 255})
	fillRect(img, image.Rect(24, 154, 304, 188), color.NRGBA{R: 8, G: 8, B: 8, A: 255})
	fillRect(img, image.Rect(24, 238, 296, 274), color.NRGBA{R: 8, G: 8, B: 8, A: 255})

	extractor := NewExtractor()
	palette, err := extractor.ExtractFromImage(img, ExtractOptions{})
	if err != nil {
		t.Fatalf("extract palette: %v", err)
	}

	if palette.Dark == nil {
		t.Fatal("expected dark color")
	}
	if palette.Light == nil {
		t.Fatal("expected light color")
	}
	if palette.Dark.Lightness >= palette.Light.Lightness {
		t.Fatalf("expected dark color to be darker than light color: dark=%0.3f light=%0.3f", palette.Dark.Lightness, palette.Light.Lightness)
	}
	if len(palette.Gradient) != 5 {
		t.Fatalf("expected 5 gradient colors, got %d", len(palette.Gradient))
	}

	hasDarkGradient := false
	for _, gradientColor := range palette.Gradient {
		if gradientColor.Lightness <= 0.18 {
			hasDarkGradient = true
			break
		}
	}
	if !hasDarkGradient {
		t.Fatal("expected at least one dark gradient anchor")
	}
}

func TestExtractFromImageAnchorsDarkAndLightAroundNeutralBases(t *testing.T) {
	t.Parallel()

	img := image.NewNRGBA(image.Rect(0, 0, 320, 320))
	fillRect(img, img.Bounds(), color.NRGBA{R: 70, G: 126, B: 226, A: 255})
	fillRect(img, image.Rect(24, 32, 292, 100), color.NRGBA{R: 36, G: 92, B: 192, A: 255})
	fillRect(img, image.Rect(48, 224, 304, 288), color.NRGBA{R: 114, G: 164, B: 242, A: 255})

	extractor := NewExtractor()
	palette, err := extractor.ExtractFromImage(img, ExtractOptions{})
	if err != nil {
		t.Fatalf("extract palette: %v", err)
	}

	if palette.Primary == nil {
		t.Fatal("expected primary color")
	}
	if palette.Dark == nil {
		t.Fatal("expected dark color")
	}
	if palette.Light == nil {
		t.Fatal("expected light color")
	}

	darkTolerance := palette.Options.DarkLightnessDeviation + 0.02
	if math.Abs(palette.Dark.Lightness-palette.Options.DarkBaseLightness) > darkTolerance {
		t.Fatalf(
			"expected dark lightness near base %0.3f (+/-%0.3f), got %0.3f",
			palette.Options.DarkBaseLightness,
			darkTolerance,
			palette.Dark.Lightness,
		)
	}

	lightTolerance := palette.Options.LightLightnessDeviation + 0.02
	if math.Abs(palette.Light.Lightness-palette.Options.LightBaseLightness) > lightTolerance {
		t.Fatalf(
			"expected light lightness near base %0.3f (+/-%0.3f), got %0.3f",
			palette.Options.LightBaseLightness,
			lightTolerance,
			palette.Light.Lightness,
		)
	}

	darkHueDistance := hueDistanceDegrees(palette.Primary.Hue, palette.Dark.Hue)
	if darkHueDistance > 35 {
		t.Fatalf("expected dark hue to stay near primary hue, got delta=%0.2f", darkHueDistance)
	}

	lightHueDistance := hueDistanceDegrees(palette.Primary.Hue, palette.Light.Hue)
	if lightHueDistance > 35 {
		t.Fatalf("expected light hue to stay near primary hue, got delta=%0.2f", lightHueDistance)
	}
}

func TestBuildGradientSwatchesRepeatsExistingOrderWhenPadding(t *testing.T) {
	t.Parallel()

	primary := makeTestSwatch(215, 58, 73, 800)
	secondary := makeTestSwatch(40, 121, 255, 540)

	result := buildGradientSwatches(themeSelection{
		primary:   swatchPointer(primary),
		secondary: swatchPointer(secondary),
	}, nil, 0.08)

	if len(result) != 5 {
		t.Fatalf("expected 5 gradient colors, got %d", len(result))
	}
	if !sameRGB(result[0], primary) {
		t.Fatalf("expected first gradient color to keep primary, got %#v", result[0])
	}
	if !sameRGB(result[1], secondary) {
		t.Fatalf("expected second gradient color to keep secondary, got %#v", result[1])
	}
	if !sameRGB(result[3], secondary) {
		t.Fatalf("expected padded gradient to cycle existing colors, got %#v", result[3])
	}
}

func TestNormalizeExtractOptionsCapsWorkerCount(t *testing.T) {
	t.Parallel()

	normalized := NormalizeExtractOptions(ExtractOptions{WorkerCount: 10_000})
	maxWorkers := runtime.GOMAXPROCS(0)
	if maxWorkers > maxWorkerCap {
		maxWorkers = maxWorkerCap
	}
	if maxWorkers < 1 {
		maxWorkers = 1
	}

	if normalized.WorkerCount < 1 || normalized.WorkerCount > maxWorkers {
		t.Fatalf("expected worker count in [1,%d], got %d", maxWorkers, normalized.WorkerCount)
	}
	if normalized.DarkBaseLightness <= 0 || normalized.LightBaseLightness <= 0 {
		t.Fatalf("expected normalized neutral base lightness values, got dark=%0.3f light=%0.3f", normalized.DarkBaseLightness, normalized.LightBaseLightness)
	}
	if normalized.DarkLightnessDeviation <= 0 || normalized.LightLightnessDeviation <= 0 {
		t.Fatalf("expected normalized neutral deviation values, got dark=%0.3f light=%0.3f", normalized.DarkLightnessDeviation, normalized.LightLightnessDeviation)
	}
	if normalized.DarkChromaScale <= 0 || normalized.LightChromaScale <= 0 {
		t.Fatalf("expected normalized neutral chroma scales, got dark=%0.3f light=%0.3f", normalized.DarkChromaScale, normalized.LightChromaScale)
	}
}

func TestNormalizeExtractOptionsClampsNeutralAnchorControls(t *testing.T) {
	t.Parallel()

	normalized := NormalizeExtractOptions(ExtractOptions{
		DarkBaseLightness:       0.9,
		LightBaseLightness:      0.1,
		DarkLightnessDeviation:  2,
		LightLightnessDeviation: 2,
		DarkChromaScale:         4,
		LightChromaScale:        4,
	})

	if normalized.DarkBaseLightness > 0.35 {
		t.Fatalf("expected dark base lightness to clamp <= 0.35, got %0.3f", normalized.DarkBaseLightness)
	}
	if normalized.LightBaseLightness < 0.75 {
		t.Fatalf("expected light base lightness to clamp >= 0.75, got %0.3f", normalized.LightBaseLightness)
	}
	if normalized.LightBaseLightness < normalized.DarkBaseLightness+0.2 {
		t.Fatalf(
			"expected light base lightness to stay at least 0.2 above dark base: dark=%0.3f light=%0.3f",
			normalized.DarkBaseLightness,
			normalized.LightBaseLightness,
		)
	}
	if normalized.DarkLightnessDeviation > 0.3 || normalized.LightLightnessDeviation > 0.2 {
		t.Fatalf(
			"expected neutral deviations to clamp, got dark=%0.3f light=%0.3f",
			normalized.DarkLightnessDeviation,
			normalized.LightLightnessDeviation,
		)
	}
	if normalized.DarkChromaScale > 1.4 || normalized.LightChromaScale > 1.2 {
		t.Fatalf(
			"expected neutral chroma scales to clamp, got dark=%0.3f light=%0.3f",
			normalized.DarkChromaScale,
			normalized.LightChromaScale,
		)
	}
}

func fillRect(img *image.NRGBA, rect image.Rectangle, fill color.NRGBA) {
	for y := rect.Min.Y; y < rect.Max.Y; y++ {
		for x := rect.Min.X; x < rect.Max.X; x++ {
			img.SetNRGBA(x, y, fill)
		}
	}
}

func makeTestSwatch(red uint8, green uint8, blue uint8, population int) swatch {
	okL, okA, okB := rgbToOKLab(red, green, blue)
	hue := math.Atan2(okB, okA) * (180 / math.Pi)
	if hue < 0 {
		hue += 360
	}
	return swatch{
		r:          red,
		g:          green,
		b:          blue,
		population: population,
		lightness:  okL,
		chroma:     math.Sqrt(okA*okA + okB*okB),
		hue:        hue,
		okL:        okL,
		okA:        okA,
		okB:        okB,
	}
}

func sameRGB(left swatch, right swatch) bool {
	return left.r == right.r && left.g == right.g && left.b == right.b
}

func hueDistanceDegrees(left float64, right float64) float64 {
	delta := math.Abs(left - right)
	if delta > 180 {
		delta = 360 - delta
	}
	return delta
}
