"""Database models for project tracking."""

from decimal import Decimal

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils.translation import gettext_lazy as _

import Tracklet.models
from Tracklet.fields import RoundingDecimalField


class ProjectStatus(models.TextChoices):
    """Status values for a project."""

    FUTURE = 'FUTURE', _('Future')
    ONGOING = 'ONGOING', _('Ongoing')
    PAST = 'PAST', _('Past')

    @classmethod
    def past_values(cls) -> list[str]:
        """Return values considered as historical/past projects."""
        return [cls.PAST]

    @classmethod
    def active_values(cls) -> list[str]:
        """Return values considered as active/future projects."""
        return [cls.FUTURE, cls.ONGOING]


def overlapping_project_reservation_filter(
    project: 'Project',
    prefix: str = 'project__',
) -> Q:
    """Return a query filter for reservations that overlap with the provided project.

    Overlap rules:
    - Only active projects are considered reserving.
    - Null start/end dates are treated as open-ended boundaries.
    """
    overlap = Q(**{f'{prefix}status__in': ProjectStatus.active_values()})

    if getattr(project, 'pk', None):
        overlap &= ~Q(**{f'{prefix}pk': project.pk})

    if project.start_date is not None:
        overlap &= (
            Q(**{f'{prefix}end_date__isnull': True})
            | Q(**{f'{prefix}end_date__gte': project.start_date})
        )

    if project.end_date is not None:
        overlap &= (
            Q(**{f'{prefix}start_date__isnull': True})
            | Q(**{f'{prefix}start_date__lte': project.end_date})
        )

    return overlap


class Project(
    Tracklet.models.InvenTreeAttachmentMixin,
    Tracklet.models.InvenTreeNotesMixin,
    Tracklet.models.InvenTreeModel,
):
    """Top-level project model."""

    class Meta:
        verbose_name = _('Project')
        ordering = ['-created', 'name']

    name = models.CharField(max_length=200, verbose_name=_('Name'))
    description = models.TextField(blank=True, default='', verbose_name=_('Description'))
    location = models.ForeignKey(
        'stock.StockLocation',
        on_delete=models.SET_NULL,
        related_name='projects',
        null=True,
        blank=True,
        verbose_name=_('Location'),
    )
    status = models.CharField(
        max_length=16,
        choices=ProjectStatus.choices,
        default=ProjectStatus.FUTURE,
        verbose_name=_('Status'),
    )
    start_date = models.DateField(blank=True, null=True, verbose_name=_('Start Date'))
    end_date = models.DateField(blank=True, null=True, verbose_name=_('End Date'))
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='+',
        verbose_name=_('Created By'),
    )
    created = models.DateTimeField(auto_now_add=True, verbose_name=_('Created'))
    updated = models.DateTimeField(auto_now=True, verbose_name=_('Updated'))

    def clean(self):
        """Model-level validation."""
        super().clean()

        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValidationError({
                'end_date': _('End date cannot be before start date'),
                'start_date': _('Start date cannot be after end date'),
            })

    @property
    def is_past(self) -> bool:
        """True if project is completed or archived."""
        return self.status in ProjectStatus.past_values()

    @property
    def is_active(self) -> bool:
        """True if project is in a non-past state."""
        return self.status != ProjectStatus.PAST

    def __str__(self):
        return self.name


class ProjectStockAllocation(Tracklet.models.InvenTreeModel):
    """Allocation of stock item quantity to a project."""

    class Meta:
        verbose_name = _('Project Stock Allocation')
        ordering = ['-created']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'stock_item'],
                name='projects_unique_project_stock_item',
            )
        ]

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='allocations',
        verbose_name=_('Project'),
    )
    stock_item = models.ForeignKey(
        'stock.StockItem',
        on_delete=models.CASCADE,
        related_name='project_allocations',
        verbose_name=_('Stock Item'),
    )
    quantity = RoundingDecimalField(
        max_digits=15,
        decimal_places=5,
        verbose_name=_('Quantity'),
        help_text=_('Quantity of stock item allocated to project'),
    )
    notes = models.TextField(blank=True, default='', verbose_name=_('Notes'))
    created = models.DateTimeField(auto_now_add=True, verbose_name=_('Created'))
    updated = models.DateTimeField(auto_now=True, verbose_name=_('Updated'))

    def clean(self):
        """Validate allocation quantity and project state."""
        super().clean()

        errors = {}

        if self.project_id and self.project.status == ProjectStatus.PAST:
            errors['project'] = _('Allocations cannot be edited for past projects')

        if self.quantity is None or self.quantity <= 0:
            errors['quantity'] = _('Allocation quantity must be greater than zero')

        if self.stock_item_id:
            overlapping_project_allocations = ProjectStockAllocation.objects.filter(
                stock_item=self.stock_item
            ).filter(
                overlapping_project_reservation_filter(self.project, prefix='project__')
            )

            if self.pk:
                overlapping_project_allocations = overlapping_project_allocations.exclude(
                    pk=self.pk
                )

            overlapping_project_quantity = (
                overlapping_project_allocations.aggregate(
                    total=Coalesce(Sum('quantity'), Decimal(0))
                )['total']
                or Decimal(0)
            )

            available = max(
                Decimal(self.stock_item.quantity)
                - Decimal(self.stock_item.build_allocation_count())
                - Decimal(self.stock_item.sales_order_allocation_count())
                - Decimal(overlapping_project_quantity),
                Decimal(0),
            )

            if self.quantity and self.quantity > available:
                errors['quantity'] = _(
                    f'Available quantity ({available}) exceeded'
                )

        if errors:
            raise ValidationError(errors)

    @property
    def project_is_past(self) -> bool:
        """True if parent project is not active."""
        return self.project.status in ProjectStatus.past_values()


class ProjectInstrument(Tracklet.models.InvenTreeModel):
    """Instrument stock item assigned to a project."""

    class Meta:
        verbose_name = _('Project Instrument')
        ordering = ['-created']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'stock_item'],
                name='projects_unique_project_instrument_stock_item',
            )
        ]

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='instruments',
        verbose_name=_('Project'),
    )
    stock_item = models.ForeignKey(
        'stock.StockItem',
        on_delete=models.CASCADE,
        related_name='project_instruments',
        verbose_name=_('Stock Item'),
    )
    quantity = RoundingDecimalField(
        max_digits=15,
        decimal_places=5,
        default=1,
        verbose_name=_('Quantity'),
        help_text=_('Quantity of stock item tracked as project instrument'),
    )
    notes = models.TextField(blank=True, default='', verbose_name=_('Notes'))
    created = models.DateTimeField(auto_now_add=True, verbose_name=_('Created'))
    updated = models.DateTimeField(auto_now=True, verbose_name=_('Updated'))

    def clean(self):
        """Validate quantity and project status."""
        super().clean()

        errors = {}

        if self.project_id and self.project.status == ProjectStatus.PAST:
            errors['project'] = _('Instruments cannot be edited for past projects')

        if self.quantity is None or self.quantity <= 0:
            errors['quantity'] = _('Instrument quantity must be greater than zero')

        if self.stock_item_id:
            overlapping_project_instruments = ProjectInstrument.objects.filter(
                stock_item=self.stock_item
            ).filter(
                overlapping_project_reservation_filter(self.project, prefix='project__')
            )

            if self.pk:
                overlapping_project_instruments = overlapping_project_instruments.exclude(
                    pk=self.pk
                )

            overlapping_project_quantity = (
                overlapping_project_instruments.aggregate(
                    total=Coalesce(Sum('quantity'), Decimal(0))
                )['total']
                or Decimal(0)
            )

            available = max(
                Decimal(self.stock_item.quantity)
                - Decimal(self.stock_item.build_allocation_count())
                - Decimal(self.stock_item.sales_order_allocation_count())
                - Decimal(overlapping_project_quantity),
                Decimal(0),
            )

            if self.quantity and self.quantity > available:
                errors['quantity'] = _(
                    f'Available quantity ({available}) exceeded'
                )

        if errors:
            raise ValidationError(errors)

    @property
    def project_is_past(self) -> bool:
        """True if parent project is not active."""
        return self.project.status in ProjectStatus.past_values()


class ProjectReportType(models.TextChoices):
    """Supported automatic project report types."""

    BROKEN_INVENTORY = 'BROKEN_INVENTORY', _('Broken Inventory')


class ProjectReport(Tracklet.models.InvenTreeModel):
    """Auto-generated report linked to a project."""

    class Meta:
        verbose_name = _('Project Report')
        ordering = ['-created']

    project = models.OneToOneField(
        Project,
        on_delete=models.CASCADE,
        related_name='report',
        verbose_name=_('Project'),
    )
    report_type = models.CharField(
        max_length=32,
        choices=ProjectReportType.choices,
        default=ProjectReportType.BROKEN_INVENTORY,
        verbose_name=_('Report Type'),
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='+',
        verbose_name=_('Created By'),
    )
    created = models.DateTimeField(auto_now_add=True, verbose_name=_('Created'))
    attachment = models.ForeignKey(
        'common.Attachment',
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='project_reports',
        verbose_name=_('Attachment'),
    )


class ProjectReportItem(Tracklet.models.InvenTreeModel):
    """Line item entries captured in a generated project report."""

    class Meta:
        verbose_name = _('Project Report Item')
        ordering = ['pk']

    report = models.ForeignKey(
        ProjectReport,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Report'),
    )
    instrument = models.ForeignKey(
        ProjectInstrument,
        on_delete=models.PROTECT,
        related_name='report_items',
        blank=True,
        null=True,
        verbose_name=_('Instrument'),
    )
    quantity = models.PositiveIntegerField(default=1, verbose_name=_('Quantity'))
    manufacture = models.CharField(max_length=100, blank=True, default='')
    model = models.CharField(max_length=100, blank=True, default='')
    sn = models.CharField(max_length=100, blank=True, default='')
    type = models.CharField(max_length=100, blank=True, default='')
    specification = models.CharField(max_length=250, blank=True, default='')
    note = models.CharField(max_length=250, blank=True, default='')
    located = models.CharField(max_length=100, blank=True, default='')
