"""Configuration options for drf-spectacular."""

from Tracklet.version import inventreeApiVersion


def get_spectacular_settings():
    """Return configuration dictionary for drf-spectacular."""
    return {
        'TITLE': 'Tracklet API',
        'DESCRIPTION': 'API for Tracklet - inventory + operations management',
        'LICENSE': {
            'name': 'MIT',
            'url': 'https://github.com/yaselmo/Tracklet/blob/main/LICENSE',
        },
        'EXTERNAL_DOCS': {
            'description': 'More information about Tracklet',
            'url': 'https://github.com/yaselmo/Tracklet#readme',
        },
        'VERSION': str(inventreeApiVersion()),
        'SERVE_INCLUDE_SCHEMA': False,
        'SCHEMA_PATH_PREFIX': '/api/',
        'POSTPROCESSING_HOOKS': [
            'Tracklet.schema.postprocess_schema_enums',
            'Tracklet.schema.postprocess_required_nullable',
            'Tracklet.schema.postprocess_print_stats',
        ],
        'ENUM_NAME_OVERRIDES': {
            'UserTypeEnum': 'users.models.UserProfile.UserType',
            'TemplateModelTypeEnum': 'report.models.ReportTemplateBase.ModelChoices',
            'AttachmentModelTypeEnum': 'common.models.Attachment.ModelChoices',
            'ParameterModelTypeEnum': 'common.models.Parameter.ModelChoices',
            'DataImportSessionModelTypeEnum': 'importer.models.DataImportSession.ModelChoices',
            # Allauth
            'UnauthorizedStatus': [[401, 401]],
            'IsTrueEnum': [[True, True]],
        },
        # oAuth2
        'OAUTH2_FLOWS': ['authorizationCode', 'clientCredentials'],
        'OAUTH2_AUTHORIZATION_URL': '/o/authorize/',
        'OAUTH2_TOKEN_URL': '/o/token/',
        'OAUTH2_REFRESH_URL': '/o/revoke_token/',
    }
