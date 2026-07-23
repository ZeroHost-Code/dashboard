package embed

import (
	"embed"
	"io/fs"
)

//go:embed public
var PublicFS embed.FS

var SubFS fs.FS

func init() {
	var err error
	SubFS, err = fs.Sub(PublicFS, "public")
	if err != nil {
		panic("failed to get public sub filesystem: " + err.Error())
	}
}
