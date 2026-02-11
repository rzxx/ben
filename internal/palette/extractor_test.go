package palette

import (
	"image"
	"image/color"
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

func fillRect(img *image.NRGBA, rect image.Rectangle, fill color.NRGBA) {
	for y := rect.Min.Y; y < rect.Max.Y; y++ {
		for x := rect.Min.X; x < rect.Max.X; x++ {
			img.SetNRGBA(x, y, fill)
		}
	}
}
