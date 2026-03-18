# Web process: gunicorn
web: env/bin/gunicorn --chdir $APP_HOME/src/backend/Tracklet -c src/backend/Tracklet/gunicorn.conf.py Tracklet.wsgi -b 0.0.0.0:$PORT
# Worker process: qcluster
worker: env/bin/python src/backend/Tracklet/manage.py qcluster
# Invoke commands
invoke: echo "" | echo "" && . env/bin/activate && invoke
# CLI: Provided for backwards compatibility
cli: echo "" | echo "" && . env/bin/activate && invoke
