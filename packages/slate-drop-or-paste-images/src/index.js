import Promise from 'es6-promise'
import isImage from 'is-image'
import isUrl from 'is-url'
import logger from 'slate-dev-logger'
import  loadImageFile  from './load-image-file'
import { extname } from 'path'
import { getEventTransfer } from 'slate-react'

/**
 * Insert images on drop or paste.
 *
 * @param {Object} options
 *   @property {Function} insertImage
 *   @property {Array} extensions (optional)
 * @return {Object} plugin
 */

function DropOrPasteImages(options = {}) {
  let { insertImage, extensions } = options

  if (options.applyTransform) {
    logger.deprecate(
      '0.6.0',
      'The `applyTransform` argument to `slate-drop-or-paste-images` has been renamed to `insertImage` instead.',
    )
    insertImage = options.applyTransform
  }

  if (!insertImage) {
    throw new Error('You must supply an `insertImage` function.')
  }

  /**
   * Check file extension against user-defined options.
   *
   * @param {Type} string
   * @return {Boolean}
   */

  function matchExt(type) {
    let accepted = false

    for (const ext of extensions) {
      if (type.includes(ext)) accepted = true
    }

    return accepted
  }

  /**
   * Apply the change for a given file and update the editor with the result.
   *
   * @param {Editor} editor
   * @param {Blob} file
   * @return {Promise}
   */

  function asyncApplyChange(editor, file) {
    return Promise.resolve(insertImage(editor, file)).then(() => {
      editor.onChange() // trigger the change handler https://docs.slatejs.org/slate-core/editor#onchange
    })
  }

  /**
   * On drop or paste.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   * @return {State}
   */

  function onInsert(event, editor, next) {
    const transfer = getEventTransfer(event)
    const range = editor.findEventRange(event)

    switch (transfer.type) {
    case 'files': // image drop from desktop
      return onInsertFiles(event, editor, next, transfer, range)
    case 'html':
      return onInsertHtml(event, editor, next, transfer, range)
      // case 'fragment':
      // case 'text':
      //   return onInsertText(event, editor, next, transfer, range)
    default:
      return next()
    }
  }

  /**
   * On drop or paste files.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   * @param {Object} transfer
   * @param {Range} range
   * @return {Boolean}
   */

  function onInsertFiles(event, editor, next, transfer, range) {
    const { files } = transfer

    // see pr-35, following CameronAckermanSEL's proposal, https://github.com/ianstormtaylor/slate-plugins/pull/35#discussion_r264957680
    const filteredFiles = !extensions ? files : files.filter(file => {
      const { type } = file
      const [, ext] = type.split('/')
      return ext && matchExt(ext)
    })


    if (!filteredFiles.length)
      return next()

    for (const file of filteredFiles) {
      if (range) editor.select(range)
      asyncApplyChange(editor, file)
    }
  }

  /**
   * On drop or paste html.
   *
   * @param {Event} event
   * @param {Editor} editor
   * @param {Function} next
   * @param {Object} transfer
   * @param {Range} range
   * @return {Boolean}
   */

  function onInsertHtml(event, editor, next, transfer, range) {
    const { html } = transfer
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const body = doc.body
    const files = []

    // find all images in the body
    // actually, this should be done by a proper HTML parser outside the plugin

    function buildImagesList(parent) {
      for (const child of parent.childNodes) {
        const { src } = child
        if (['a', 'img'].includes(child.nodeName.toLowerCase()) && src) {
          const ext = extname(src).slice(1)
          if (!extensions || matchExt(ext))
            files.push({ src, ext })
        }
        else {
          buildImagesList(child)
        }
      }
    }

    buildImagesList(body)

    if (!files.length)
      return next()

    files.forEach((file) => {
      loadImageFile(file.src, (err, loadedFile) => {
        if (err) return
        if (range) editor.select(range)
        asyncApplyChange(editor, loadedFile)
      })
    })
  }

  // /**
  //  * On drop or paste text.
  //  *
  //  * @param {Event} event
  //  * @param {Editor} editor
  //  * @param {Function} next
  //  * @param {Object} transfer
  //  * @param {Range} range
  //  * @return {Boolean}
  //  */
  //
  // function onInsertText(event, editor, next, transfer, range) {
  //   const { text } = transfer
  //   if (!isUrl(text)) return next()
  //   if (!isImage(text)) return next()
  //
  //   loadImageFile(text, (err, file) => {
  //     if (err) return
  //
  //     editor.onChange(c => { // TODO is c still fine or do we have a legacy "change" here instead of "editor"? - probably we have to change it
  //       if (range) {
  //         c.select(range)
  //       }
  //
  //       asyncApplyChange(c, editor, file)
  //     })
  //   })
  // }

  /**
   * Return the plugin.
   *
   * @type {Object}
   */

  return {
    onDrop: onInsert,
    onPaste: onInsert,
  }
}

/**
 * Export.
 *
 * @type {Function}
 */

export default DropOrPasteImages
