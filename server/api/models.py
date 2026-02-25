from django.db import models

# Create your models here.
class StockPrice(models.Model):
    symbol = models.CharField(max_length=20, db_index=True)
    # We store time as unix timestamp (integer) or DateTime? 
    # Finnhub gives unix timestamp. Storing as DateTime is more Django-friendly.
    timestamp = models.DateTimeField(db_index=True)
    open = models.FloatField()
    high = models.FloatField()
    low = models.FloatField()
    close = models.FloatField()
    volume = models.BigIntegerField(null=True, blank=True)

    class Meta:
        # Ensures no duplicate candles for the same time
        unique_together = ('symbol', 'timestamp')
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.symbol} - {self.timestamp}"
