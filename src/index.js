const gcloud = require('gcloud');
const gutil = require('gulp-util');
const mime = require('mime');
const through = require('through2');
const assert = require('assert');

const PLUGIN_NAME = 'gulp-gcloud';
const PluginError = gutil.PluginError;

/**
 * Get the file metadata
 *
 * @private
 * @param {File} file
 */
function getMetadata(file, extraMetadata = {}) {
  const meta = {
    ...extraMetadata,
    contentType: mime.lookup(file.path),
  };

  // Check if it's gziped
  if (file.contentEncoding && file.contentEncoding.indexOf('gzip') > -1) {
    meta.contentEncoding = 'gzip';
  }

  return meta;
}

/**
 * Normalize the path to save the file on GCS
 *
 * @param base - Base path
 * @param file - File to save
 */
function normalizePath(_base, file) {
  const _relative = file.path.replace(file.base, '');
  let base = _base;

  // ensure there is a tailing slash in the base path
  if (base && !/\/$/.test(base)) {
    base += '/';
  }

  // ensure the is no starting slash
  if (base && /^\//.test(base)) {
    base = base.replace(/^\//, '');
  }

  base = base || '';
  return base + _relative;
}

/**
 * Log the file succesfully uploaded
 */
function logSuccess(gPath) {
  gutil.log('Uploaded', gutil.colors.cyan(gPath));
}

/**
 * Asserts configuration and wraps in PluginError
 */
function assertConfiguration(options) {
  try {
    assert(options, 'Missing configuration object');
    assert(options.bucket, 'Bucket name must be specified via `bucket`');
    assert(options.keyFilename || options.credentials, 'credentials must be specified');
    assert(options.projectId, 'projectId must be specified');
  } catch (e) {
    throw new PluginError(PLUGIN_NAME, e, { showStack: true });
  }
}

/**
 * Upload a file stream to Google Cloud Storage
 *
 * @param {Object}  options
 * @param {String}  options.bucket      - Name of the bucket we want to upload the file into
 * @param {String}  options.keyFilename - Full path to the KeyFile JSON
 * @param {String}  options.credentials - Object with gcloud credentials, specify either that, or keyFilename
 * @param {String}  options.projectId   - Project id
 * @param {String}  [options.base='/']  - Base path for saving the file
 * @param {Boolean} [options.public]    - Set the file as public
 * @param {String}  [options.cacheControl] - Sets cache control for a given file
 */
function gPublish(options) {
  // assert that we have correct configuration
  assertConfiguration(options);

  // files
  const {
    base,
    bucket: bucketName,
    public: pub,
    metadata: extraMetadata,
    ...gcloudOptions,
  } = options;

  const storage = gcloud.storage(gcloudOptions);
  const bucket = storage.bucket(bucketName);

  if (pub) {
    bucket.interceptors.push({
      request: (requestOptions) => {
        requestOptions.qs.predefinedAcl = 'publicRead';
      },
    });
  }

  return through.obj((file, enc, done) => {
    /* istanbul ignore next */
    if (file.isNull()) {
      return done(null, file);
    }

    file.path = file.path.replace(/\.gz$/, '');
    const metadata = getMetadata(file, extraMetadata);

    // Authenticate on Google Cloud Storage
    const gcPah = normalizePath(base, file);
    const gcFile = bucket.file(gcPah);
    const stream = gcFile.createWriteStream({ metadata });

    return file
      .pipe(stream)
      .on('error', done)
      .on('finish', () => {
        logSuccess(gcPah);
        return done(null, file);
      });
  });
}

module.exports = gPublish;
