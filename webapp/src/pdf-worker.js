// pdf.js worker started by the app, so that the polyfills are loaded in the worker too (older Safari/iOS).
import './polyfills'
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
