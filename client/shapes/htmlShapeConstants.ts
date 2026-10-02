/**
 * How much of the shape's edge (on each side) is a plain non-iframe frame
 * around the content (see HtmlShapeUtil). The iframe's actual rendered pixel
 * size is therefore `w - HTML_SHAPE_FRAME * 2` by `h - HTML_SHAPE_FRAME * 2`,
 * not `w` by `h` - the template tools need this to size their content to
 * exactly fill the iframe with no overflow/scrollbars.
 */
export const HTML_SHAPE_FRAME = 8
